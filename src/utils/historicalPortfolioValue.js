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
import { alignBenchmarkClosesToDates } from './benchmarkComparison';
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

// closes: [{date, close}] sorted or unsorted (alignBenchmarkClosesToDates
// sorts internally) - returns the carried-forward close for `date`, or
// null if there's no close on or before it.
function closeOnOrBefore(date, closes) {
  if (!Array.isArray(closes) || closes.length === 0) return null;
  const [aligned] = alignBenchmarkClosesToDates([date], closes);
  return aligned;
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

// Samples weekly points across [fromDate, toDate] (inclusive of both
// endpoints) rather than one point per calendar day - bounds how many
// carry-forward lookups a multi-year range does for a chart with far
// fewer visually distinct pixels than that many days anyway (prices only
// change on ~250 trading days/year regardless of how finely it's sampled).
export const computeHistoricalPortfolioSeries = (fromDate, toDate, holdings, priceData) => {
  if (!fromDate || !toDate || fromDate > toDate) return [];

  const dates = [];
  let cursor = new Date(`${fromDate}T00:00:00Z`);
  const end = new Date(`${toDate}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return [];

  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + WEEK_MS);
  }
  if (dates[dates.length - 1] !== toDate) dates.push(toDate);

  return dates.map((date) => computePortfolioValueAtDate(date, holdings, priceData));
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
