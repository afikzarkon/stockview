// Classification of an Israeli-listed holding: does it actually give
// FOREIGN market exposure, and is it a fund/index tracker rather than an
// ordinary share?
//
// Both questions are answered automatically, from the security's own name
// and the instrument metadata the exchange returns for it (see
// server/taseSecurityLookup.js) - there is no longer a "נכס זר?" column for
// the user to set by hand. The manual `isForeignAsset` field is still read
// when present, purely so portfolios saved before this change keep behaving
// exactly as their owner set them up; nothing writes it any more.
//
// IMPORTANT: for an Israeli holding, `stockName` is the numeric TASE
// security id, not a name - it is what the quote/history APIs are keyed by.
// The human-readable name lives in `officialName` (resolved through the
// search box / the security lookup). Classification therefore has to read
// officialName first and only fall back to stockName, which is what the
// previous version got wrong: it tested the keyword list against stockName
// alone, so for a real holding it was always matching against a string of
// digits and could never fire.

import { ETF_SECTOR_KEY, UNCLASSIFIED_SECTOR_KEY } from './sectorLabels';

// Names that indicate exposure to markets outside Israel. "חוץ" ("foreign")
// is the decisive one and the reason this is name-based at all: the
// exchange itself names these instruments with it - "איישרס.חוץ P 500&S",
// "קרן חוץ נסחרת", "מניות חוץ" - so a holding whose name contains it is
// foreign exposure by the exchange's own description of it.
const FOREIGN_TRACKING_KEYWORDS = [
  'חוץ',
  'S&P 500',
  'S&P500',
  'נאסד"ק',
  'נאסד״ק',
  'NASDAQ',
  'מחקה',
  'עוקב',
  'עולמי',
  'עולם',
  'גלובלי',
  'MSCI',
  'RUSSELL',
  'DAX',
  'NIKKEI',
  "דאו ג'ונס",
  'דאו ג"ונס'
];

// Instrument names/types that mean "this is a fund, not a share": ETFs
// ("קרן סל"/"קרנות סל"), foreign-listed tracking funds ("קרן חוץ נסחרת"),
// mutual funds ("קרן נאמנות") and index trackers ("מחקה מדד").
const FUND_KEYWORDS = ['קרן', 'קרנות', 'סל', 'מחקה', 'מדד', 'ETF', 'INDEX', 'FUND', 'UCITS'];

// Re-exported so callers that only deal in classification don't have to
// import from two modules; the single definition lives in sectorLabels.js
// next to its Hebrew display label.
export { ETF_SECTOR_KEY };

const hasKeyword = (text, keywords) => {
  const upper = String(text || '').toUpperCase();
  if (!upper.trim()) return false;
  return keywords.some((keyword) => upper.includes(keyword.toUpperCase()));
};

// The human-readable name of an Israeli holding, in the order of
// preference the rest of this module classifies by. Exported because the
// tables need exactly the same resolution to decide what to display.
export const israeliStockDisplayName = (stock) => {
  if (!stock) return '';
  return String(stock.officialName || stock.longName || stock.stockName || '').trim();
};

// True when the holding's own name says it tracks something outside
// Israel. `stockName` is accepted directly (not just a holding object) so
// callers with only a name still work.
export const detectForeignAssetIsraeliEtf = (stockNameOrHolding) => {
  const name =
    typeof stockNameOrHolding === 'string'
      ? stockNameOrHolding
      : israeliStockDisplayName(stockNameOrHolding);
  return hasKeyword(name, FOREIGN_TRACKING_KEYWORDS);
};

// True when the holding is a fund/ETF/index tracker rather than an ordinary
// share. Checks, in order: the exchange's own instrument type stored on the
// holding (securityType/securitySubType, filled in by the security lookup),
// then the name.
export const detectIsraeliFund = (stock) => {
  if (!stock) return false;
  if (stock.isFund === true) return true;
  if (hasKeyword(stock.securityType, FUND_KEYWORDS)) return true;
  if (hasKeyword(stock.securitySubType, FUND_KEYWORDS)) return true;
  return hasKeyword(israeliStockDisplayName(stock), FUND_KEYWORDS);
};

// Resolves the effective exchange bucket for an Israeli-listed holding for
// DISPLAY/aggregation purposes only (pie chart, sector breakdown) - never
// for price-fetching/quantity logic, which always treats every item in the
// israeliStocks array as Israeli regardless of this.
//
// isForeignAsset is a legacy manual override: true = force foreign,
// false = force domestic, null/absent (the only thing written now) =
// classify automatically.
export const effectiveExchangeForIsraeliStock = (stock) => {
  if (stock && stock.isForeignAsset === true) return 'american';
  if (stock && stock.isForeignAsset === false) return 'israeli';
  // The exchange's own flag for a foreign-listed tracking fund is
  // authoritative when we have it; the name heuristic covers everything
  // else, including TASE-listed ETFs that track a foreign index.
  if (stock && stock.isForeignETF === true) return 'american';
  return detectForeignAssetIsraeliEtf(stock) ? 'american' : 'israeli';
};

// The sector an Israeli holding should be counted under, resolved
// automatically:
//   1. an explicit `sector` already on the holding wins (a value the user
//      set before this became automatic, or one written by the lookup);
//   2. a fund/ETF/index tracker is classified as ETF_SECTOR_KEY - its
//      sector is "it's an index fund", which is the useful answer, not the
//      mix of sectors inside whatever it tracks;
//   3. an ordinary share takes the sector mapped from the exchange's own
//      branch string (see israeliSectorMapping.js), which the security
//      lookup stores on the holding as `branch`;
//   4. otherwise unclassified.
export const resolveIsraeliSector = (stock, branchToSector) => {
  if (!stock) return UNCLASSIFIED_SECTOR_KEY;
  if (stock.sector) return stock.sector;
  if (detectIsraeliFund(stock)) return ETF_SECTOR_KEY;
  if (typeof branchToSector === 'function') {
    const mapped = branchToSector(stock.branch || stock.branchLeaf);
    if (mapped) return mapped;
  }
  return UNCLASSIFIED_SECTOR_KEY;
};
