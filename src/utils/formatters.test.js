import {
  formatDate,
  formatPrice,
  formatPriceWithSign,
  normalizeIsraeliPrice,
  calculateProfitPercentage,
  normalizeIsraeliStocksFromStorage,
  toNum,
  profitClass,
  formatDailyChangePercent
} from './formatters';

describe('formatPrice', () => {
  test('formats a positive number with 2 decimals and thousands separator', () => {
    expect(formatPrice(1234.5)).toBe('1,234.50');
  });
  test('handles null/undefined/NaN as 0.00', () => {
    expect(formatPrice(null)).toBe('0.00');
    expect(formatPrice(undefined)).toBe('0.00');
    expect(formatPrice(NaN)).toBe('0.00');
  });
});

describe('formatPriceWithSign', () => {
  test('positive values have no trailing minus', () => {
    expect(formatPriceWithSign(500)).toBe('500.00');
  });
  test('negative values get a TRAILING minus (Hebrew RTL convention), not a leading one', () => {
    expect(formatPriceWithSign(-125)).toBe('125.00-');
  });
  test('zero is not treated as negative', () => {
    expect(formatPriceWithSign(0)).toBe('0.00');
  });
});

describe('normalizeIsraeliPrice', () => {
  test('leaves small numbers (already in shekels) unchanged', () => {
    expect(normalizeIsraeliPrice(35.5)).toBe(35.5);
  });
  test('divides large numbers (agorot) by 100', () => {
    expect(normalizeIsraeliPrice(3500)).toBe(35);
  });
  test('handles string input', () => {
    expect(normalizeIsraeliPrice('3500')).toBe(35);
  });
  test('handles null/undefined as 0', () => {
    expect(normalizeIsraeliPrice(null)).toBe(0);
    expect(normalizeIsraeliPrice(undefined)).toBe(0);
  });
});

describe('calculateProfitPercentage', () => {
  test('computes percentage gain correctly', () => {
    expect(calculateProfitPercentage(1000, 1200)).toBe('20.00');
  });
  test('computes percentage loss correctly', () => {
    expect(calculateProfitPercentage(1000, 800)).toBe('-20.00');
  });
  test('returns 0 when purchase value is 0 (avoids divide-by-zero)', () => {
    expect(calculateProfitPercentage(0, 500)).toBe(0);
  });
});

describe('normalizeIsraeliStocksFromStorage', () => {
  test('converts agorot prices to shekels for each stock in the array', () => {
    const input = [
      { stockName: 'A', currentPrice: 3500 },
      { stockName: 'B', currentPrice: 25 }
    ];
    const result = normalizeIsraeliStocksFromStorage(input);
    expect(result[0].currentPrice).toBe(35);
    expect(result[1].currentPrice).toBe(25);
  });
  test('returns empty array for non-array input', () => {
    expect(normalizeIsraeliStocksFromStorage(null)).toEqual([]);
    expect(normalizeIsraeliStocksFromStorage(undefined)).toEqual([]);
  });
});

describe('toNum', () => {
  test('converts valid numeric strings/numbers', () => {
    expect(toNum('42')).toBe(42);
    expect(toNum(42)).toBe(42);
  });
  test('returns 0 for invalid input', () => {
    expect(toNum('not a number')).toBe(0);
    expect(toNum(undefined)).toBe(0);
    expect(toNum(NaN)).toBe(0);
  });
});

describe('profitClass', () => {
  test('positive and zero values get profit-positive', () => {
    expect(profitClass(100)).toBe('profit-positive');
    expect(profitClass(0)).toBe('profit-positive');
  });
  test('negative values get profit-negative', () => {
    expect(profitClass(-1)).toBe('profit-negative');
  });
  test('null/undefined treated as 0 (profit-positive)', () => {
    expect(profitClass(null)).toBe('profit-positive');
    expect(profitClass(undefined)).toBe('profit-positive');
  });
});

describe('formatDailyChangePercent', () => {
  test('formats a number to 2 decimals', () => {
    expect(formatDailyChangePercent(1.2)).toBe('1.20');
  });
  test('null/undefined fall back to 0.00', () => {
    expect(formatDailyChangePercent(null)).toBe('0.00');
    expect(formatDailyChangePercent(undefined)).toBe('0.00');
  });
  test('0 is formatted as 0.00, not treated as missing', () => {
    expect(formatDailyChangePercent(0)).toBe('0.00');
  });
});

describe('formatDate', () => {
  test('formats an ISO date string as Hebrew locale date', () => {
    // he-IL formats as d.m.yyyy
    expect(formatDate('2023-01-15')).toBe('15.1.2023');
  });
});
