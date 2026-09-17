// Detects an Israeli-listed security that actually tracks a foreign
// index/asset (a mutual fund/ETF replicating the S&P 500, Nasdaq, MSCI,
// etc., traded on TASE) - these should count as "foreign" exposure in
// the pie chart (portfolioAnalysis.js's exchangeDistribution) even
// though they're bought/priced through the Israeli exchange like any
// other TASE security. Purely a name-based heuristic, not perfect - that
// is exactly why a manual per-stock override (isForeignAsset) exists
// alongside it for whatever this misses (false positive or negative),
// rather than trying to make the keyword list itself airtight.
const FOREIGN_TRACKING_KEYWORDS = [
  'S&P 500',
  'S&P500',
  'נאסד"ק',
  'נאסד״ק',
  'NASDAQ',
  'מחקה',
  'עוקב',
  'נייר חוץ',
  'עולמי',
  'MSCI',
  "דאו ג'ונס",
  'דאו ג"ונס'
];

export const detectForeignAssetIsraeliEtf = (stockName) => {
  const name = String(stockName || '').trim();
  if (!name) return false;
  const upper = name.toUpperCase();
  return FOREIGN_TRACKING_KEYWORDS.some((keyword) => upper.includes(keyword.toUpperCase()));
};

// Resolves the effective exchange bucket for an Israeli-listed stock item
// for DISPLAY/aggregation purposes only (pie chart, sector breakdown) -
// never for price-fetching/quantity logic, which always treats every
// item in the israeliStocks array as Israeli regardless of this.
// isForeignAsset: null (default) = auto-detect by name, true = force
// foreign, false = force domestic (overrides even a keyword match).
export const effectiveExchangeForIsraeliStock = (stock) => {
  if (stock && stock.isForeignAsset === true) return 'american';
  if (stock && stock.isForeignAsset === false) return 'israeli';
  return detectForeignAssetIsraeliEtf(stock && stock.stockName) ? 'american' : 'israeli';
};
