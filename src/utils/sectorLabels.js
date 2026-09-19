// Yahoo returns GICS-like sector names in English (from the assetProfile
// module). This app is fully Hebrew, so we translate the common ones for
// display; anything not in the map falls back to the original English
// name rather than disappearing, since new/uncommon sector strings do
// occasionally show up.
const SECTOR_LABELS_HE = {
  Technology: 'טכנולוגיה',
  'Financial Services': 'שירותים פיננסיים',
  Healthcare: 'בריאות',
  'Consumer Cyclical': 'צריכה מחזורית',
  'Consumer Defensive': 'צריכה בסיסית',
  Industrials: 'תעשייה',
  Energy: 'אנרגיה',
  Utilities: 'תשתיות',
  'Real Estate': 'נדל"ן',
  'Communication Services': 'תקשורת',
  'Basic Materials': 'חומרי גלם',
  // Not a Yahoo/GICS sector: the bucket every automatically-identified
  // Israeli fund/ETF/index tracker lands in (see israeliEtfClassifier.js's
  // ETF_SECTOR_KEY). "What sector is an S&P 500 tracker in" has no useful
  // equity answer - "it's an index fund" is the answer, and keeping it as
  // its own bucket is what stops a portfolio of index funds reading as
  // entirely unclassified.
  ETF: 'קרנות סל / מחקות מדד'
};

export const UNCLASSIFIED_SECTOR_KEY = '__unclassified__';
export const UNCLASSIFIED_SECTOR_LABEL_HE = 'לא סווג';

// The known sector keys, for a manual-tagging dropdown (e.g. an Israeli
// stock with no automatic Yahoo-sourced sector, see sectorAnalysis.js) -
// using the same keys as the American/Yahoo side so a manually-tagged
// Israeli holding consolidates into the same bucket as a same-sector
// American one, instead of getting its own parallel Hebrew-only sector.
export const ETF_SECTOR_KEY = 'ETF';

export const KNOWN_SECTOR_KEYS = Object.keys(SECTOR_LABELS_HE);

export const sectorLabelHe = (sectorKey) => {
  if (!sectorKey || sectorKey === UNCLASSIFIED_SECTOR_KEY) return UNCLASSIFIED_SECTOR_LABEL_HE;
  return SECTOR_LABELS_HE[sectorKey] || sectorKey;
};
