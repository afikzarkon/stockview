import {
  indexSeriesToBase100,
  alignBenchmarkClosesToDates,
  buildComparisonSeries
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
