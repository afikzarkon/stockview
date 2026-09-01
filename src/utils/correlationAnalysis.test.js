import {
  computeDailyReturns,
  pearsonCorrelation,
  buildCorrelationMatrix,
  highestCorrelatedPairs
} from './correlationAnalysis';

// Generates n+1 close points (n returns) so tests can control exactly how
// many overlapping days two series share, relative to the 20-return
// minimum the module enforces.
function closesFromReturns(startDate, returns) {
  let price = 100;
  const points = [{ date: startDate, close: price }];
  const start = new Date(`${startDate}T00:00:00Z`);
  returns.forEach((r, i) => {
    price = price * (1 + r);
    const d = new Date(start.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
    points.push({ date: d.toISOString().slice(0, 10), close: price });
  });
  return points;
}

describe('computeDailyReturns', () => {
  test('computes day-over-day % change and skips the first point', () => {
    const points = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 110 },
      { date: '2024-01-03', close: 99 }
    ];
    const returns = computeDailyReturns(points);
    expect(returns).toHaveLength(2);
    expect(returns[0].date).toBe('2024-01-02');
    expect(returns[0].return).toBeCloseTo(0.1, 10);
    expect(returns[1].date).toBe('2024-01-03');
    expect(returns[1].return).toBeCloseTo(-0.1, 10); // 99/110 - 1
  });

  test('skips a point with a missing/non-finite close instead of throwing', () => {
    const points = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: null },
      { date: '2024-01-03', close: 105 }
    ];
    const returns = computeDailyReturns(points);
    expect(returns).toEqual([]); // both pairs touch the null point
  });

  test('handles fewer than 2 points without throwing', () => {
    expect(computeDailyReturns([])).toEqual([]);
    expect(computeDailyReturns([{ date: '2024-01-01', close: 100 }])).toEqual([]);
    expect(computeDailyReturns(null)).toEqual([]);
  });
});

describe('pearsonCorrelation', () => {
  const returns = Array.from({ length: 25 }, (_, i) => 0.01 * ((i % 5) - 2)); // varied, deterministic

  test('is 1 for two identical return series (perfectly correlated)', () => {
    const a = returns.map((r, i) => ({ date: `d${i}`, return: r }));
    const b = returns.map((r, i) => ({ date: `d${i}`, return: r }));
    expect(pearsonCorrelation(a, b)).toBeCloseTo(1, 6);
  });

  test('is -1 for a perfectly inverted return series', () => {
    const a = returns.map((r, i) => ({ date: `d${i}`, return: r }));
    const b = returns.map((r, i) => ({ date: `d${i}`, return: -r }));
    expect(pearsonCorrelation(a, b)).toBeCloseTo(-1, 6);
  });

  test('returns null when fewer than 20 dates overlap', () => {
    const a = returns.slice(0, 19).map((r, i) => ({ date: `d${i}`, return: r }));
    const b = returns.slice(0, 19).map((r, i) => ({ date: `d${i}`, return: -r }));
    expect(pearsonCorrelation(a, b)).toBeNull();
  });

  test('only matches by shared date, ignoring dates present in just one series', () => {
    const a = returns.map((r, i) => ({ date: `d${i}`, return: r }));
    // b shares the same 25 dates as a, plus some extra unmatched ones - the
    // extras should be ignored, not cause a crash or skew the result.
    const b = [
      ...returns.map((r, i) => ({ date: `d${i}`, return: -r })),
      { date: 'unmatched-1', return: 0.5 },
      { date: 'unmatched-2', return: -0.5 }
    ];
    expect(pearsonCorrelation(a, b)).toBeCloseTo(-1, 6);
  });

  test('returns null when a series has zero variance (flat returns)', () => {
    const a = returns.map((r, i) => ({ date: `d${i}`, return: r }));
    const flat = returns.map((_, i) => ({ date: `d${i}`, return: 0 }));
    expect(pearsonCorrelation(a, flat)).toBeNull();
  });
});

describe('buildCorrelationMatrix', () => {
  test('builds a symmetric matrix with 1 on the diagonal, sorted symbols', () => {
    const posReturns = Array.from({ length: 30 }, (_, i) => 0.01 * Math.sin(i));
    const negReturns = posReturns.map((r) => -r);

    const historyBySymbol = {
      MSFT: closesFromReturns('2024-01-01', posReturns),
      AAPL: closesFromReturns('2024-01-01', posReturns),
      TSLA: closesFromReturns('2024-01-01', negReturns)
    };

    const { symbols, matrix } = buildCorrelationMatrix(historyBySymbol);
    expect(symbols).toEqual(['AAPL', 'MSFT', 'TSLA']); // alphabetical

    const aapl = symbols.indexOf('AAPL');
    const msft = symbols.indexOf('MSFT');
    const tsla = symbols.indexOf('TSLA');

    expect(matrix[aapl][aapl]).toBe(1);
    expect(matrix[aapl][msft]).toBeCloseTo(1, 6); // identical series
    expect(matrix[msft][aapl]).toBeCloseTo(matrix[aapl][msft], 10); // symmetric
    expect(matrix[aapl][tsla]).toBeCloseTo(-1, 6); // inverted series
  });

  test('excludes symbols with fewer than 2 price points', () => {
    const historyBySymbol = {
      AAPL: closesFromReturns('2024-01-01', Array.from({ length: 25 }, () => 0.01)),
      EMPTY: [],
      SINGLE: [{ date: '2024-01-01', close: 100 }]
    };
    const { symbols } = buildCorrelationMatrix(historyBySymbol);
    expect(symbols).toEqual(['AAPL']);
  });

  test('returns empty symbols/matrix for no input', () => {
    expect(buildCorrelationMatrix({})).toEqual({ symbols: [], matrix: [] });
  });
});

describe('highestCorrelatedPairs', () => {
  test('ranks pairs by |correlation| descending, excluding the diagonal and nulls', () => {
    const symbols = ['A', 'B', 'C'];
    const matrix = [
      [1, 0.2, null],
      [0.2, 1, -0.9],
      [null, -0.9, 1]
    ];
    const pairs = highestCorrelatedPairs(symbols, matrix, 3);
    expect(pairs).toEqual([
      { a: 'B', b: 'C', correlation: -0.9 },
      { a: 'A', b: 'B', correlation: 0.2 }
    ]);
  });

  test('respects the limit', () => {
    const symbols = ['A', 'B', 'C'];
    const matrix = [
      [1, 0.2, 0.5],
      [0.2, 1, -0.9],
      [0.5, -0.9, 1]
    ];
    expect(highestCorrelatedPairs(symbols, matrix, 1)).toHaveLength(1);
  });

  test('handles missing/empty input without throwing', () => {
    expect(highestCorrelatedPairs([], [], 3)).toEqual([]);
    expect(highestCorrelatedPairs(null, null, 3)).toEqual([]);
  });
});
