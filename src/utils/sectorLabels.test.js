import { sectorLabelHe, UNCLASSIFIED_SECTOR_KEY, UNCLASSIFIED_SECTOR_LABEL_HE, KNOWN_SECTOR_KEYS } from './sectorLabels';

describe('sectorLabelHe', () => {
  test('translates a known English GICS-like key to Hebrew', () => {
    expect(sectorLabelHe('Technology')).toBe('טכנולוגיה');
  });

  test('returns the unclassified label for the unclassified key or falsy input', () => {
    expect(sectorLabelHe(UNCLASSIFIED_SECTOR_KEY)).toBe(UNCLASSIFIED_SECTOR_LABEL_HE);
    expect(sectorLabelHe(null)).toBe(UNCLASSIFIED_SECTOR_LABEL_HE);
    expect(sectorLabelHe('')).toBe(UNCLASSIFIED_SECTOR_LABEL_HE);
  });

  test('falls back to the raw key for an unrecognized sector string instead of disappearing', () => {
    expect(sectorLabelHe('Some New Sector')).toBe('Some New Sector');
  });
});

describe('KNOWN_SECTOR_KEYS', () => {
  test('every key resolves to a real Hebrew translation, not a fallback to itself', () => {
    expect(KNOWN_SECTOR_KEYS.length).toBeGreaterThan(0);
    KNOWN_SECTOR_KEYS.forEach((key) => {
      expect(sectorLabelHe(key)).not.toBe(key);
    });
  });

  test('does not include the unclassified sentinel key', () => {
    expect(KNOWN_SECTOR_KEYS).not.toContain(UNCLASSIFIED_SECTOR_KEY);
  });
});
