import { computeReceivedDividends, buildUpcomingDividendCalendar } from './dividendAnalysis';

describe('computeReceivedDividends', () => {
  test('sums payments on/after the earliest purchase date, times total quantity held', () => {
    const history = [
      { date: '2023-06-01', amountPerShare: 0.5 }, // before purchase - excluded
      { date: '2024-03-01', amountPerShare: 0.51 },
      { date: '2024-06-01', amountPerShare: 0.51 }
    ];
    const lots = [{ quantity: 10, purchaseDate: '2024-01-01' }];
    // (0.51 + 0.51) * 10 = 10.2
    expect(computeReceivedDividends(history, lots)).toBeCloseTo(10.2, 6);
  });

  test('sums quantity across multiple lots of the same symbol', () => {
    const history = [{ date: '2024-06-01', amountPerShare: 1 }];
    const lots = [
      { quantity: 10, purchaseDate: '2024-01-01' },
      { quantity: 5, purchaseDate: '2024-03-01' }
    ];
    // earliest purchase date is 2024-01-01, so the payment counts; total qty = 15
    expect(computeReceivedDividends(history, lots)).toBe(15);
  });

  test('excludes every payment when the earliest purchase is after all of them', () => {
    const history = [{ date: '2024-01-01', amountPerShare: 1 }];
    const lots = [{ quantity: 10, purchaseDate: '2024-06-01' }];
    expect(computeReceivedDividends(history, lots)).toBe(0);
  });

  test('returns 0 for missing/empty history or lots without throwing', () => {
    expect(computeReceivedDividends([], [{ quantity: 10, purchaseDate: '2024-01-01' }])).toBe(0);
    expect(computeReceivedDividends(null, [{ quantity: 10, purchaseDate: '2024-01-01' }])).toBe(0);
    expect(computeReceivedDividends([{ date: '2024-01-01', amountPerShare: 1 }], [])).toBe(0);
    expect(computeReceivedDividends([{ date: '2024-01-01', amountPerShare: 1 }], null)).toBe(0);
  });

  test('returns 0 when lots have no purchaseDate at all', () => {
    const history = [{ date: '2024-01-01', amountPerShare: 1 }];
    const lots = [{ quantity: 10 }];
    expect(computeReceivedDividends(history, lots)).toBe(0);
  });
});

describe('buildUpcomingDividendCalendar', () => {
  test('includes only future dates, sorted soonest first', () => {
    const dividendsBySymbol = {
      AAPL: { nextDividendDateEpoch: toEpoch('2024-08-01'), dividendRate: 1, dividendYieldPercent: 0.5 },
      MSFT: { nextDividendDateEpoch: toEpoch('2024-07-01'), dividendRate: 3, dividendYieldPercent: 0.8 },
      KO: { nextDividendDateEpoch: toEpoch('2024-01-01'), dividendRate: 2, dividendYieldPercent: 3 } // past - excluded
    };
    const rows = buildUpcomingDividendCalendar(dividendsBySymbol, '2024-06-15');
    expect(rows.map((r) => r.symbol)).toEqual(['MSFT', 'AAPL']);
    expect(rows[0].date).toBe('2024-07-01');
  });

  test('falls back to exDividendDateEpoch when nextDividendDateEpoch is missing', () => {
    const dividendsBySymbol = {
      T: { exDividendDateEpoch: toEpoch('2024-08-01'), dividendRate: 1, dividendYieldPercent: 6 }
    };
    const rows = buildUpcomingDividendCalendar(dividendsBySymbol, '2024-06-15');
    expect(rows).toEqual([{ symbol: 'T', date: '2024-08-01', dividendRate: 1, dividendYieldPercent: 6 }]);
  });

  test('excludes a symbol with no usable date', () => {
    const dividendsBySymbol = { XYZ: { nextDividendDateEpoch: null, exDividendDateEpoch: null } };
    expect(buildUpcomingDividendCalendar(dividendsBySymbol, '2024-06-15')).toEqual([]);
  });

  test('handles missing/empty input without throwing', () => {
    expect(buildUpcomingDividendCalendar({}, '2024-06-15')).toEqual([]);
    expect(buildUpcomingDividendCalendar(null, '2024-06-15')).toEqual([]);
  });
});

function toEpoch(dateStr) {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
}
