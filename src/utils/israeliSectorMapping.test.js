import { sectorFromTaseBranch } from './israeliSectorMapping';
import { KNOWN_SECTOR_KEYS } from './sectorLabels';

describe('sectorFromTaseBranch', () => {
  // Real FullBranch strings as the exchange returns them (verified live
  // against api.tase.co.il/api/company/securitydata).
  test('maps a real branch path to a sector', () => {
    expect(sectorFromTaseBranch('הייטק-ביומד-פארמה')).toBe('Healthcare');
    expect(sectorFromTaseBranch('מכשירים פיננסים-קרן חוץ נסחרת-קרן חוץ נסחרת')).toBe('Financial Services');
  });

  // The leaf is the most specific segment, so a path whose top-level
  // segment is "הייטק" but whose leaf is pharma must resolve as healthcare,
  // not technology - the ordering of the rules is what guarantees that.
  test('the most specific segment wins over a broader ancestor segment', () => {
    expect(sectorFromTaseBranch('הייטק-ביומד-פארמה')).toBe('Healthcare');
    expect(sectorFromTaseBranch('הייטק-תוכנה ואינטרנט')).toBe('Technology');
  });

  test('maps the common TASE branches to the same keys the American/Yahoo side uses', () => {
    expect(sectorFromTaseBranch('בנקים')).toBe('Financial Services');
    expect(sectorFromTaseBranch('נדל"ן ובינוי-נדל"ן מניב בישראל')).toBe('Real Estate');
    expect(sectorFromTaseBranch('חיפושי נפט וגז')).toBe('Energy');
    expect(sectorFromTaseBranch('מסחר ושרותים-מלונאות ותיירות')).toBe('Consumer Cyclical');
    expect(sectorFromTaseBranch('מזון')).toBe('Consumer Defensive');
    expect(sectorFromTaseBranch('תעשייה-כימיה, גומי ופלסטיק')).toBe('Basic Materials');
  });

  // Consolidating with the Yahoo sectors is the whole point: an Israeli
  // bank and an American one must land in the same slice of the breakdown.
  test('only ever returns keys the sector labels already know about', () => {
    const branches = [
      'הייטק-ביומד-פארמה',
      'בנקים',
      'ביטוח',
      'נדל"ן ובינוי',
      'חיפושי נפט וגז',
      'מסחר ושרותים',
      'מזון',
      'תעשייה',
      'תקשורת ומדיה',
      'חשמל'
    ];
    branches.forEach((branch) => {
      const sector = sectorFromTaseBranch(branch);
      expect(sector).not.toBeNull();
      expect(KNOWN_SECTOR_KEYS).toContain(sector);
    });
  });

  // The Hebrew gershayim (״) and an ASCII double quote are both used in
  // practice for abbreviations like נדל"ן.
  test('matches regardless of which double-quote character the branch uses', () => {
    expect(sectorFromTaseBranch('נדל״ן ובינוי')).toBe('Real Estate');
    expect(sectorFromTaseBranch('נדל"ן ובינוי')).toBe('Real Estate');
  });

  test('returns null rather than guessing for an unknown or empty branch', () => {
    expect(sectorFromTaseBranch('ענף שלא קיים')).toBeNull();
    expect(sectorFromTaseBranch('')).toBeNull();
    expect(sectorFromTaseBranch(null)).toBeNull();
    expect(sectorFromTaseBranch(undefined)).toBeNull();
  });
});
