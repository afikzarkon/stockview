import {
  indexSeriesToBase100,
  alignBenchmarkClosesToDates,
  buildComparisonSeries,
  convertBenchmarkPointsToILS,
  benchmarkPointsInILS
} from './benchmarkComparison';

describe('indexSeriesToBase100', () => {
  test('first point becomes exactly 100', () => {
    const indexed = indexSeriesToBase100([
      { date: '2026-01-01', value: 200 },
      { date: '2026-01-02', value: 220 }
    ]);
    expect(indexed[0].indexed).toBe(100);
    expect(indexed[1].indexed).toBeCloseTo(110, 10);
  });

  test('empty series or zero base returns empty array', () => {
    expect(indexSeriesToBase100([])).toEqual([]);
    expect(indexSeriesToBase100([{ date: '2026-01-01', value: 0 }])).toEqual([]);
  });
});

describe('alignBenchmarkClosesToDates', () => {
  const benchmarkPoints = [
    { date: '2026-01-01', close: 100 },
    { date: '2026-01-02', close: 102 },
    { date: '2026-01-05', close: 105 } // e.g. after a weekend gap
  ];

  test('carries the last known close forward over gaps (weekends/holidays)', () => {
    const result = alignBenchmarkClosesToDates(
      ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05'],
      benchmarkPoints
    );
    expect(result).toEqual([100, 102, 102, 102, 105]);
  });

  test('dates before the benchmark starts are null', () => {
    const result = alignBenchmarkClosesToDates(['2025-12-30', '2026-01-01'], benchmarkPoints);
    expect(result).toEqual([null, 100]);
  });

  test('empty benchmark data returns all nulls', () => {
    expect(alignBenchmarkClosesToDates(['2026-01-01', '2026-01-02'], [])).toEqual([null, null]);
  });

  test('unsorted benchmark input is sorted internally', () => {
    const shuffled = [
      { date: '2026-01-05', close: 105 },
      { date: '2026-01-01', close: 100 },
      { date: '2026-01-02', close: 102 }
    ];
    expect(alignBenchmarkClosesToDates(['2026-01-02'], shuffled)).toEqual([102]);
  });
});

describe('buildComparisonSeries', () => {
  test('both series start at index 100 on the first common date', () => {
    const portfolioSeries = [
      { date: '2026-01-01', value: 1000 },
      { date: '2026-01-05', value: 1100 }
    ];
    const benchmarkPoints = [
      { date: '2026-01-01', close: 4000 },
      { date: '2026-01-05', close: 4200 }
    ];
    const combined = buildComparisonSeries(portfolioSeries, benchmarkPoints);
    expect(combined[0].portfolioIndexed).toBe(100);
    expect(combined[0].benchmarkIndexed).toBe(100);
    expect(combined[1].portfolioIndexed).toBeCloseTo(110, 5); // +10%
    expect(combined[1].benchmarkIndexed).toBeCloseTo(105, 5); // +5%
  });

  test('portfolio outperforming the benchmark shows a growing gap', () => {
    const portfolioSeries = [
      { date: '2026-01-01', value: 1000 },
      { date: '2026-01-02', value: 1200 } // +20%
    ];
    const benchmarkPoints = [
      { date: '2026-01-01', close: 100 },
      { date: '2026-01-02', close: 105 } // +5%
    ];
    const combined = buildComparisonSeries(portfolioSeries, benchmarkPoints);
    const last = combined[combined.length - 1];
    expect(last.portfolioIndexed - last.benchmarkIndexed).toBeCloseTo(15, 5);
  });

  test('skips leading portfolio dates that predate the benchmark data', () => {
    const portfolioSeries = [
      { date: '2025-12-20', value: 900 }, // before benchmark history starts
      { date: '2026-01-01', value: 1000 },
      { date: '2026-01-02', value: 1010 }
    ];
    const benchmarkPoints = [
      { date: '2026-01-01', close: 100 },
      { date: '2026-01-02', close: 101 }
    ];
    const combined = buildComparisonSeries(portfolioSeries, benchmarkPoints);
    expect(combined).toHaveLength(2);
    expect(combined[0].date).toBe('2026-01-01');
    expect(combined[0].portfolioIndexed).toBe(100);
  });

  test('no overlapping dates returns an empty series', () => {
    const portfolioSeries = [{ date: '2025-01-01', value: 1000 }];
    const benchmarkPoints = [{ date: '2026-01-01', close: 100 }];
    expect(buildComparisonSeries(portfolioSeries, benchmarkPoints)).toEqual([]);
  });

  test('empty portfolio series returns an empty array', () => {
    expect(buildComparisonSeries([], [{ date: '2026-01-01', close: 100 }])).toEqual([]);
  });
});

describe('convertBenchmarkPointsToILS', () => {
  const fx = [
    { date: '2024-01-01', close: 4 },
    { date: '2024-02-01', close: 3 }
  ];

  test('restates each close at the rate on its own date', () => {
    const points = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-02-01', close: 110 }
    ];
    expect(convertBenchmarkPointsToILS(points, fx)).toEqual([
      { date: '2024-01-01', close: 400 },
      { date: '2024-02-01', close: 330 }
    ]);
  });

  // The whole reason the conversion exists. In dollars this index gained
  // 10%; to a shekel investor, with the dollar falling from 4 to 3, it lost
  // about 17.5%. Indexing both lines to 100 would have shown the +10%.
  test('an FX move changes the answer, which is the point', () => {
    const points = [
      { date: '2024-01-01', close: 100 },
      { date: '2024-02-01', close: 110 }
    ];
    const converted = convertBenchmarkPointsToILS(points, fx);
    const usdReturn = points[1].close / points[0].close - 1;
    const ilsReturn = converted[1].close / converted[0].close - 1;
    expect(usdReturn).toBeCloseTo(0.1, 5);
    expect(ilsReturn).toBeCloseTo(-0.175, 3);
  });

  test('carries the last known rate forward over a day the FX market was shut', () => {
    const points = [{ date: '2024-01-15', close: 100 }];
    expect(convertBenchmarkPointsToILS(points, fx)).toEqual([{ date: '2024-01-15', close: 400 }]);
  });

  // A converted close is only as real as the rate behind it; carrying the
  // first known rate backwards would invent one.
  test('drops dates with no rate on or before them rather than inventing one', () => {
    const points = [
      { date: '2023-06-01', close: 100 },
      { date: '2024-01-01', close: 100 }
    ];
    expect(convertBenchmarkPointsToILS(points, fx)).toEqual([{ date: '2024-01-01', close: 400 }]);
  });

  test('returns nothing rather than unconverted dollars when no rates are available', () => {
    expect(convertBenchmarkPointsToILS([{ date: '2024-01-01', close: 100 }], [])).toEqual([]);
    expect(convertBenchmarkPointsToILS([{ date: '2024-01-01', close: 100 }], null)).toEqual([]);
    expect(convertBenchmarkPointsToILS([], fx)).toEqual([]);
  });
});

describe('benchmarkPointsInILS', () => {
  const fx = [{ date: '2024-01-01', close: 4 }];
  const points = [{ date: '2024-01-01', close: 100 }];

  test('converts a dollar-quoted index', () => {
    expect(benchmarkPointsInILS(points, 'USD', fx)).toEqual([{ date: '2024-01-01', close: 400 }]);
  });

  // A TASE index is already in shekels; converting it would apply an FX
  // move that never happened to it.
  test('leaves a shekel-quoted index exactly as it is', () => {
    expect(benchmarkPointsInILS(points, 'ILS', fx)).toBe(points);
  });

  test('handles a missing series without throwing', () => {
    expect(benchmarkPointsInILS(null, 'ILS', fx)).toEqual([]);
    expect(benchmarkPointsInILS(null, 'USD', fx)).toEqual([]);
  });
});
