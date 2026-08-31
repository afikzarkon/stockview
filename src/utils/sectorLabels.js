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
  'Basic Materials': 'חומרי גלם'
};

export const UNCLASSIFIED_SECTOR_KEY = '__unclassified__';
export const UNCLASSIFIED_SECTOR_LABEL_HE = 'לא סווג';

export const sectorLabelHe = (sectorKey) => {
  if (!sectorKey || sectorKey === UNCLASSIFIED_SECTOR_KEY) return UNCLASSIFIED_SECTOR_LABEL_HE;
  return SECTOR_LABELS_HE[sectorKey] || sectorKey;
};
