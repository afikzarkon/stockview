// "What was my portfolio worth in ILS on date X?" - reconstructs a
// historical value from real historical closing prices, instead of
// relying on a saved snapshot existing for that exact date. Each
// holding's price on the requested date is the most recent trading-day
// close on or before it (carried forward over weekends/holidays) -
// reusing alignBenchmarkClosesToDates (benchmarkComparison.js) per
// holding instead of reimplementing the same carry-forward logic here.
//
// Quantity held as of a date is the sum of lots whose purchaseDate is on
// or before that date - this app has no sell/lot-reduction model (only
// additions), so "as of date X" can only ever include lots that existed
// by then. A lot added after date X simply isn't counted yet, which is
// the correct behavior, not a limitation to work around.
//
// Non-traded accounts (provident funds, money-market funds, current
// accounts, bank savings funds) have no historical close to look up, so
// they are reconstructed from their own ledgers instead - see
// ledgerAccountHistory.js and bankSavingsFund.js. They're opt-in per call:
// pass them and they're included, leave them out and the series covers the
// traded holdings only.
import { valueOfLedgerAccountAtDate, valueOfLedgerAccountsAtDate } from './ledgerAccountHistory';
import { computeBankSavingsFundValue } from './bankSavingsFund';

function groupBySymbol(lots) {
  return lots.reduce((acc, lot) => {
    const symbol = lot.stockName;
    if (!acc[symbol]) acc[symbol] = [];
    acc[symbol].push(lot);
    return acc;
  }, {});
}

function quantityAsOfDate(lots, date) {
  return lots
    .filter((lot) => lot.purchaseDate && lot.purchaseDate <= date)
    .reduce((sum, lot) => sum + (lot.quantity || 0), 0);
}

// Sorted-once index per close series, so a lookup is a binary search
// instead of a fresh copy-and-sort of the whole series.
//
// This used to delegate to alignBenchmarkClosesToDates(), which sorts a
// copy of the array it's given on every call. That function is built for
// "align a whole list of dates in one pass", and used that way the sort is
// paid once. Calling it with a single date - as this did, once per holding
// per sampled date - made it O(n log n) PER LOOKUP. With three years of
// TASE history (~750 closes), ten holdings and a multi-year chart, that is
// hundreds of thousands of array sorts on the main thread, which is what
// made the date picker freeze the page (measured: ~7.4s per 100k lookups,
// and a half-typed year produced ~1M of them).
//
// Keyed by the array itself, so a series fetched once is indexed once and
// every later lookup against it is free - and the entry disappears with
// the array, no cache invalidation to get wrong.
const closeIndexCache = new WeakMap();

function getCloseIndex(closes) {
  if (!Array.isArray(closes) || closes.length === 0) return null;
  const cached = closeIndexCache.get(closes);
  if (cached) return cached;

  const sorted = [...closes]
    .filter((point) => point && point.date != null && Number.isFinite(Number(point.close)))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const index = { dates: sorted.map((p) => p.date), values: sorted.map((p) => Number(p.close)) };
  closeIndexCache.set(closes, index);
  return index;
}

// The most recent close on or before `date` (carrying the last trading
// day's close forward over weekends/holidays), or null if there's none.
function closeOnOrBefore(date, closes) {
  const index = getCloseIndex(closes);
  if (!index || index.dates.length === 0) return null;

  // Rightmost entry whose date is <= the requested one.
  let lo = 0;
  let hi = index.dates.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (index.dates[mid] <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found === -1 ? null : index.values[found];
}

// priceData shape:
//   taseHistoricalCloses: { [securityId]: [{date, close}] } - close in agorot
//   yahooHistoricalCloses: { [symbol]: [{date, close}] } - close in USD
//   fxHistoricalCloses: [{date, close}] - USD/ILS rate
export const computePortfolioValueAtDate = (
  date,
  {
    israeliStocks = [],
    americanStocks = [],
    pensionFunds = [],
    cashFunds = [],
    bankBalances = [],
    bankSavingsFunds = []
  } = {},
  priceData = {}
) => {
  const { taseHistoricalCloses = {}, yahooHistoricalCloses = {}, fxHistoricalCloses = [] } = priceData;

  let totalILS = 0;
  let hasAnyValue = false;
  let isPartial = false;

  const israeliBySymbol = groupBySymbol(israeliStocks);
  Object.entries(israeliBySymbol).forEach(([symbol, lots]) => {
    const quantity = quantityAsOfDate(lots, date);
    if (quantity <= 0) return;
    const priceAgorot = closeOnOrBefore(date, taseHistoricalCloses[symbol]);
    if (priceAgorot === null) {
      isPartial = true;
      return;
    }
    totalILS += quantity * (priceAgorot / 100);
    hasAnyValue = true;
  });

  const americanBySymbol = groupBySymbol(americanStocks);
  const hasAmericanHoldings = Object.keys(americanBySymbol).length > 0;
  const fxRate = hasAmericanHoldings ? closeOnOrBefore(date, fxHistoricalCloses) : null;
  Object.entries(americanBySymbol).forEach(([symbol, lots]) => {
    const quantity = quantityAsOfDate(lots, date);
    if (quantity <= 0) return;
    const priceUSD = closeOnOrBefore(date, yahooHistoricalCloses[symbol]);
    if (priceUSD === null || fxRate === null) {
      isPartial = true;
      return;
    }
    totalILS += quantity * priceUSD * fxRate;
    hasAnyValue = true;
  });

  // Non-traded accounts, reconstructed from their own ledgers rather than
  // from market prices. A category that's empty (or simply not passed)
  // contributes nothing and never marks the point partial - "no provident
  // fund" is not missing data.
  const ledgerValue =
    valueOfLedgerAccountsAtDate(pensionFunds, date) +
    valueOfLedgerAccountsAtDate(cashFunds, date) +
    valueOfLedgerAccountsAtDate(bankBalances, date);
  const bankSavingsValue = (bankSavingsFunds || []).reduce(
    (sum, fund) => sum + (computeBankSavingsFundValue(fund, date) || 0),
    0
  );
  if (ledgerValue !== 0 || bankSavingsValue !== 0) {
    totalILS += ledgerValue + bankSavingsValue;
    hasAnyValue = true;
  }

  return { date, valueILS: hasAnyValue ? totalILS : null, isPartial };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

// Hard ceiling on how many points a series may contain, no matter how long
// the requested range is.
//
// Weekly sampling alone is NOT a bound - it's a bound only if the range is
// short. An <input type="date"> fires onChange on every keystroke while the
// year is being typed, so asking for "2023" walks through 0002, 0020 and
// 0202 first, and a range starting in year 2 is ~105,000 weeks. Each of
// those points prices every holding, so a single keystroke could schedule
// over a million price lookups synchronously on the main thread - the page
// didn't slow down, it stopped responding. (Both halves of that are fixed:
// this cap, and the binary-searched close index above.)
//
// 400 points is comfortably more than a chart a few hundred pixels wide can
// distinguish, and covers ~8 years at weekly resolution before the step
// starts widening at all.
const MAX_SERIES_POINTS = 400;

// Sampling dates across [fromDate, toDate], inclusive of both endpoints.
// Weekly while that fits inside MAX_SERIES_POINTS, then progressively
// coarser so a very long range costs the same as a short one instead of
// scaling without limit. Exported for tests; the series builder below is
// the normal entry point.
export const buildSampleDates = (fromDate, toDate) => {
  const start = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const span = end.getTime() - start.getTime();
  // Widen the step if weekly sampling would exceed the cap. Math, not a
  // loop with a break: the step is chosen up front so the walk below can
  // never run long regardless of the span it's given.
  const stepMs = Math.max(WEEK_MS, Math.ceil(span / (MAX_SERIES_POINTS - 1) / DAY_MS) * DAY_MS);

  const dates = [];
  for (let t = start.getTime(); t <= end.getTime(); t += stepMs) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  // The exact end date always gets its own point - it's the one the
  // "value at the end of the period" figure is read from.
  if (dates[dates.length - 1] !== toDate) dates.push(toDate);
  return dates;
};

// Samples points across [fromDate, toDate] (inclusive of both endpoints)
// rather than one point per calendar day - a chart has far fewer visually
// distinct pixels than that many days anyway, and prices only change on
// ~250 trading days a year regardless of how finely it's sampled.
export const computeHistoricalPortfolioSeries = (fromDate, toDate, holdings, priceData) => {
  if (!fromDate || !toDate || fromDate > toDate) return [];
  return buildSampleDates(fromDate, toDate).map((date) =>
    computePortfolioValueAtDate(date, holdings, priceData)
  );
};

// The itemized "what was each holding/account worth on date X" breakdown,
// in exactly the shape a monthly checkpoint stores (see
// monthlySnapshotBreakdown.js: one { key, label, value } entry per holding,
// grouped by the same category keys).
//
// This is what lets the monthly tracker fill itself in: pick a month, and
// every row is computed from the historical closes for that date and from
// the deposit/value ledgers the user already maintains in the main tables -
// no retyping of figures the app can work out for itself.
//
// Stock rows are keyed by the same name the live breakdown uses
// (stockName), so a generated month lines up row-for-row with a month
// captured live and the two compare item by item.
export const computeHistoricalBreakdownAtDate = (date, holdings = {}, priceData = {}) => {
  const {
    israeliStocks = [],
    americanStocks = [],
    pensionFunds = [],
    cashFunds = [],
    bankBalances = [],
    bankSavingsFunds = []
  } = holdings;
  const { taseHistoricalCloses = {}, yahooHistoricalCloses = {}, fxHistoricalCloses = [] } = priceData;

  const israeli = [];
  Object.entries(groupBySymbol(israeliStocks)).forEach(([symbol, lots]) => {
    const quantity = quantityAsOfDate(lots, date);
    if (quantity <= 0) return;
    const priceAgorot = closeOnOrBefore(date, taseHistoricalCloses[symbol]);
    if (priceAgorot === null) return;
    const label = lots.find((lot) => lot.officialName)?.officialName;
    israeli.push({
      key: symbol,
      label: label ? `${label} (${symbol})` : symbol,
      value: quantity * (priceAgorot / 100)
    });
  });

  const american = [];
  const americanBySymbol = groupBySymbol(americanStocks);
  const fxRate = Object.keys(americanBySymbol).length ? closeOnOrBefore(date, fxHistoricalCloses) : null;
  Object.entries(americanBySymbol).forEach(([symbol, lots]) => {
    const quantity = quantityAsOfDate(lots, date);
    if (quantity <= 0) return;
    const priceUSD = closeOnOrBefore(date, yahooHistoricalCloses[symbol]);
    if (priceUSD === null || fxRate === null) return;
    american.push({ key: symbol, label: symbol, value: quantity * priceUSD * fxRate });
  });

  // Accounts that didn't exist yet on the requested date reconstruct to 0
  // and are left out entirely, rather than showing as a zero row.
  const ledgerItems = (accounts, fallbackLabel, keyPrefix) =>
    (accounts || [])
      .map((account, index) => ({
        key: account.fundName || `${keyPrefix}-${index + 1}`,
        label:
          account.fundName ||
          ((accounts || []).length > 1 ? `${fallbackLabel} #${index + 1}` : fallbackLabel),
        value: valueOfLedgerAccountAtDate(account, date)
      }))
      .filter((item) => item.value !== 0);

  const bankSavings = (bankSavingsFunds || [])
    .map((fund, index) => ({
      key: fund.fundName || `bank-savings-${index + 1}`,
      label: fund.fundName || 'קופת חיסכון בבנק',
      value: computeBankSavingsFundValue(fund, date) || 0
    }))
    .filter((item) => item.value !== 0);

  return {
    israeli,
    american,
    pension: ledgerItems(pensionFunds, 'קופת גמל', 'pension'),
    cashFunds: ledgerItems(cashFunds, 'קרן כספית', 'cash'),
    bank: ledgerItems(bankBalances, 'עו"ש', 'bank'),
    bankSavings
  };
};

// Sum of every item in a breakdown produced above - the totalValueILS a
// monthly checkpoint is saved with.
export const sumHistoricalBreakdown = (breakdown) =>
  Object.values(breakdown || {}).reduce(
    (sum, items) =>
      sum + (Array.isArray(items) ? items.reduce((s, item) => s + (item.value || 0), 0) : 0),
    0
  );
