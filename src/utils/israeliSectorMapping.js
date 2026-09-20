// Maps the Tel Aviv Stock Exchange's own branch classification (the
// `FullBranch` string on its securitydata response, e.g.
// "הייטק-ביומד-פארמה" or "מסחר ושרותים-מלונאות ותיירות") onto the same
// sector keys the American/Yahoo side uses (see sectorLabels.js).
//
// Using the SAME keys as the Yahoo sectors is the whole point: a
// manually-unclassified Israeli bank and an American one then consolidate
// into one "Financial Services" slice of the sector breakdown instead of
// sitting in two parallel, incomparable buckets. That is why this maps to
// Yahoo's English GICS-like names rather than inventing Hebrew sector keys.
//
// TASE's branch string is a dash-separated path, coarsest segment first
// ("הייטק-ביומד-פארמה" = tech > biomed > pharma), and the vocabulary is
// small and stable. Matching is substring-based over the whole path, most
// specific rule first, so a new leaf under a known branch still resolves
// correctly instead of falling through to unclassified.

// Ordered: the first rule whose keyword appears in the branch path wins.
// More specific terms come before the broader ones they'd otherwise be
// swallowed by (e.g. "נדל"ן מניב" before the generic "נדל"ן").
const BRANCH_RULES = [
  { keywords: ['ביומד', 'פארמה', 'ביוטכנולוגיה', 'רפואה', 'מכשור רפואי'], sector: 'Healthcare' },
  { keywords: ['בנקים', 'ביטוח', 'שרותים פיננסים', 'שירותים פיננסיים', 'מכשירים פיננסים', 'פיננס'], sector: 'Financial Services' },
  { keywords: ['נדל"ן', 'נדלן', 'נדל״ן', 'בנייה', 'בניה'], sector: 'Real Estate' },
  // Deliberately NOT matching 'אינטרנט': the exchange's software branch is
  // "הייטק-תוכנה ואינטרנט", which belongs under Technology, and a rule for
  // 'אינטרנט' this high up would swallow it.
  { keywords: ['תקשורת', 'מדיה'], sector: 'Communication Services' },
  { keywords: ['נפט', 'גז', 'אנרגיה', 'חיפושי'], sector: 'Energy' },
  { keywords: ['חשמל', 'מים', 'תשתיות'], sector: 'Utilities' },
  { keywords: ['כימיה', 'גומי', 'פלסטיק', 'מתכת', 'עץ', 'נייר', 'כרייה', 'חומרי גלם'], sector: 'Basic Materials' },
  { keywords: ['מזון', 'משקאות', 'טבק'], sector: 'Consumer Defensive' },
  { keywords: ['מסחר', 'קמעונאות', 'מלונאות', 'תיירות', 'פנאי', 'אופנה', 'טקסטיל'], sector: 'Consumer Cyclical' },
  { keywords: ['תעשייה', 'השקעות ואחזקות', 'אחזקות', 'חשמל ואלקטרוניקה', 'ביטחוניות', 'בטחוניות'], sector: 'Industrials' },
  // Broadest tech rule last: "הייטק" is the top-level segment of several
  // paths whose leaf is really healthcare (biomed/pharma), so those must
  // have already matched above.
  { keywords: ['הייטק', 'טכנולוגיה', 'תוכנה', 'שבבים', 'אלקטרוניקה', 'מחשבים'], sector: 'Technology' }
];

// Normalizes the various ways a double-quote can be written in Hebrew
// abbreviations (ASCII ", the Hebrew gershayim ״) so a rule keyword written
// one way still matches a branch string written the other.
function normalize(text) {
  return String(text || '')
    .replace(/[״”“]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// branch: the exchange's FullBranch string (or any single segment of it).
// Returns a sector key from sectorLabels.js's SECTOR_LABELS_HE, or null
// when nothing matches - callers fall back to "unclassified" rather than
// guessing.
export const sectorFromTaseBranch = (branch) => {
  const normalized = normalize(branch);
  if (!normalized) return null;
  const rule = BRANCH_RULES.find((r) => r.keywords.some((keyword) => normalized.includes(normalize(keyword))));
  return rule ? rule.sector : null;
};

export const TASE_BRANCH_RULES = BRANCH_RULES;
