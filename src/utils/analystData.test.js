import {
  recommendationLabelHe,
  recommendationSentiment,
  computeUpsidePercent,
  actionLabelHe,
  formatEpochDateISO,
  totalTrendOpinions
} from './analystData';

describe('recommendationLabelHe', () => {
  test('translates known keys to Hebrew', () => {
    expect(recommendationLabelHe('buy')).toBe('קנייה');
    expect(recommendationLabelHe('strong_sell')).toBe('מכירה חזקה');
    expect(recommendationLabelHe('hold')).toBe('החזקה');
  });

  test('is case-insensitive', () => {
    expect(recommendationLabelHe('BUY')).toBe('קנייה');
  });

  test('falls back to the raw value for unknown keys, and to a placeholder for null', () => {
    expect(recommendationLabelHe('mystery_rating')).toBe('mystery_rating');
    expect(recommendationLabelHe(null)).toBe('לא ידוע');
    expect(recommendationLabelHe(undefined)).toBe('לא ידוע');
  });
});

describe('recommendationSentiment', () => {
  test('buy-side keys are positive, sell-side are negative, hold is neutral', () => {
    expect(recommendationSentiment('strong_buy')).toBe('positive');
    expect(recommendationSentiment('buy')).toBe('positive');
    expect(recommendationSentiment('hold')).toBeNull();
    expect(recommendationSentiment('sell')).toBe('negative');
    expect(recommendationSentiment('strong_sell')).toBe('negative');
    expect(recommendationSentiment('underperform')).toBe('negative');
  });

  test('null/unknown returns null', () => {
    expect(recommendationSentiment(null)).toBeNull();
    expect(recommendationSentiment('something_else')).toBeNull();
  });
});

describe('computeUpsidePercent', () => {
  test('positive when target is above current price', () => {
    expect(computeUpsidePercent(100, 120)).toBeCloseTo(20, 5);
  });

  test('negative when target is below current price', () => {
    expect(computeUpsidePercent(100, 80)).toBeCloseTo(-20, 5);
  });

  test('null when either input is missing/zero', () => {
    expect(computeUpsidePercent(null, 120)).toBeNull();
    expect(computeUpsidePercent(100, null)).toBeNull();
    expect(computeUpsidePercent(0, 120)).toBeNull();
  });
});

describe('actionLabelHe', () => {
  test('translates known action codes', () => {
    expect(actionLabelHe('up')).toBe('שדרוג');
    expect(actionLabelHe('down')).toBe('הורדה');
    expect(actionLabelHe('main')).toBe('שימור דירוג');
    expect(actionLabelHe('init')).toBe('תחילת סיקור');
    expect(actionLabelHe('reit')).toBe('אישור דירוג');
  });

  test('empty/unknown input handled gracefully', () => {
    expect(actionLabelHe('')).toBe('');
    expect(actionLabelHe(null)).toBe('');
    expect(actionLabelHe('weird')).toBe('weird');
  });
});

describe('formatEpochDateISO', () => {
  test('converts unix seconds to an ISO date string', () => {
    expect(formatEpochDateISO(1735689600)).toBe('2025-01-01');
  });

  test('non-finite input returns null', () => {
    expect(formatEpochDateISO(null)).toBeNull();
    expect(formatEpochDateISO(undefined)).toBeNull();
    expect(formatEpochDateISO(NaN)).toBeNull();
  });
});

describe('totalTrendOpinions', () => {
  test('sums all rating buckets', () => {
    const trend = { strongBuy: 5, buy: 10, hold: 3, sell: 1, strongSell: 0 };
    expect(totalTrendOpinions(trend)).toBe(19);
  });

  test('null trend returns null', () => {
    expect(totalTrendOpinions(null)).toBeNull();
  });

  test('trend with no numeric buckets returns null', () => {
    expect(totalTrendOpinions({})).toBeNull();
  });
});
