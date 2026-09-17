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
import { alignBenchmarkClosesToDates } from './benchmarkComparison';

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
export const computePortfolioValueAtDate = (date, { israeliStocks = [], americanStocks = [] } = {}, priceData = {}) => {
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
