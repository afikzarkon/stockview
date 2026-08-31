import {
  buildEquitySeries,
  computeMaxDrawdown,
  computePeriodReturns,
  computeVolatilityPercent,
  computeSharpeRatio,
  computeBestWorstPeriod,
  computePortfolioStats
} from './portfolioStats';

describe('buildEquitySeries', () => {
  test('sorts by date and normalizes to {date, value}', () => {
    const series = buildEquitySeries([
      { date: '2026-01-03', totalValueILS: 300 },
      { date: '2026-01-01', totalValueILS: 100 },
      { date: '2026-01-02', totalValueILS: 200 }
    ]);
    expect(series).toEqual([
      { date: '2026-01-01', value: 100 },
      { date: '2026-01-02', value: 200 },
      { date: '2026-01-03', value: 300 }
    ]);
  });

  test('drops rows with missing date or non-numeric value', () => {
    const series = buildEquitySeries([
      { date: '2026-01-01', totalValueILS: 100 },
      { date: null, totalValueILS: 200 },
      { date: '2026-01-02', totalValueILS: 'not-a-number' }
    ]);
    expect(series).toEqual([{ date: '2026-01-01', value: 100 }]);
  });

  test('handles non-array input gracefully', () => {
    expect(buildEquitySeries(null)).toEqual([]);
    expect(buildEquitySeries(undefined)).toEqual([]);
  });
});

describe('computeMaxDrawdown', () => {
  test('is zero for a monotonically increasing series', () => {
    const series = buildEquitySeries([
      { date: '2026-01-01', totalValueILS: 100 },
      { date: '2026-01-02', totalValueILS: 110 },
      { date: '2026-01-03', totalValueILS: 120 }
    ]);
    expect(computeMaxDrawdown(series).maxDrawdownPercent).toBe(0);
  });

  test('finds the largest peak-to-trough drop, not just the last drop', () => {
    // peak 200 -> trough 100 is a 50% drawdown; the later 150->120 drop (20%) is smaller
    const series = buildEquitySeries([
      { date: '2026-01-01', totalValueILS: 100 },
      { date: '2026-01-02', totalValueILS: 200 },
      { date: '2026-01-03', totalValueILS: 100 },
      { date: '2026-01-04', totalValueILS: 150 },
      { date: '2026-01-05', totalValueILS: 120 }
    ]);
    const dd = computeMaxDrawdown(series);
    expect(dd.maxDrawdownPercent).toBeCloseTo(50, 5);
    expect(dd.peakDate).toBe('2026-01-02');
    expect(dd.troughDate).toBe('2026-01-03');
  });

  test('empty series returns zero drawdown with null dates', () => {
    expect(computeMaxDrawdown([])).toEqual({
      maxDrawdownPercent: 0,
      peakDate: null,
      troughDate: null
    });
  });
});

describe('computePeriodReturns', () => {
  test('computes return and elapsed days between consecutive points', () => {
    const series = buildEquitySeries([
      { date: '2026-01-01', totalValueILS: 100 },
      { date: '2026-01-11', totalValueILS: 110 }
    ]);
    const returns = computePeriodReturns(series);
    expect(returns).toHaveLength(1);
    expect(returns[0].periodReturn).toBeCloseTo(0.1, 10);
    expect(returns[0].days).toBeCloseTo(10, 5);
  });

  test('a single snapshot produces no returns', () => {
    const series = buildEquitySeries([{ date: '2026-01-01', totalValueILS: 100 }]);
    expect(computePeriodReturns(series)).toEqual([]);
  });
});

describe('computeVolatilityPercent / computeSharpeRatio', () => {
  test('need at least two return periods (3 snapshots) to compute anything', () => {
    const oneReturn = computePeriodReturns(
      buildEquitySeries([
        { date: '2026-01-01', totalValueILS: 100 },
        { date: '2026-01-02', totalValueILS: 105 }
      ])
    );
    expect(computeVolatilityPercent(oneReturn)).toBeNull();
    expect(computeSharpeRatio(oneReturn)).toBeNull();
  });

  test('a perfectly flat series has ~0 volatility and a null Sharpe (no variance to divide by)', () => {
    const flatReturns = computePeriodReturns(
      buildEquitySeries([
        { date: '2026-01-01', totalValueILS: 100 },
        { date: '2026-01-02', totalValueILS: 101 },
        { date: '2026-01-03', totalValueILS: 102.01 },
        { date: '2026-01-04', totalValueILS: 103.0301 }
      ])
    );
    // constant 1%/day growth => ~0 stdev of daily-equivalent returns
    expect(computeVolatilityPercent(flatReturns)).toBeCloseTo(0, 2);
    expect(computeSharpeRatio(flatReturns)).toBeNull();
  });

  test('a genuinely volatile series produces a positive volatility figure', () => {
    const bumpyReturns = computePeriodReturns(
      buildEquitySeries([
        { date: '2026-01-01', totalValueILS: 100 },
        { date: '2026-01-02', totalValueILS: 120 },
        { date: '2026-01-03', totalValueILS: 90 },
        { date: '2026-01-04', totalValueILS: 115 }
      ])
    );
    const vol = computeVolatilityPercent(bumpyReturns);
    expect(vol).toBeGreaterThan(0);
  });
});

describe('computeBestWorstPeriod', () => {
  test('picks the largest positive and largest negative period returns', () => {
    const returns = computePeriodReturns(
      buildEquitySeries([
        { date: '2026-01-01', totalValueILS: 100 },
        { date: '2026-01-02', totalValueILS: 130 }, // +30%
        { date: '2026-01-03', totalValueILS: 100 }, // -23.1%
        { date: '2026-01-04', totalValueILS: 105 } // +5%
      ])
    );
    const { best, worst } = computeBestWorstPeriod(returns);
    expect(best.date).toBe('2026-01-02');
    expect(worst.date).toBe('2026-01-03');
  });

  test('empty input returns nulls', () => {
    expect(computeBestWorstPeriod([])).toEqual({ best: null, worst: null });
  });
});

describe('computePortfolioStats', () => {
  test('reports hasHistory=false and null risk stats with fewer than 2 snapshots', () => {
    const stats = computePortfolioStats([{ date: '2026-01-01', totalValueILS: 100 }]);
    expect(stats.hasHistory).toBe(false);
    expect(stats.hasEnoughForRiskStats).toBe(false);
    expect(stats.totalReturnPercent).toBeNull();
    expect(stats.volatilityPercent).toBeNull();
    expect(stats.sharpeRatio).toBeNull();
  });

  test('computes total return once there are 2+ snapshots, even before risk stats are meaningful', () => {
    const stats = computePortfolioStats([
      { date: '2026-01-01', totalValueILS: 100 },
      { date: '2026-01-15', totalValueILS: 110 }
    ]);
    expect(stats.hasHistory).toBe(true);
    expect(stats.hasEnoughForRiskStats).toBe(false); // needs >= 5 snapshots
    expect(stats.totalReturnPercent).toBeCloseTo(10, 5);
    expect(stats.volatilityPercent).toBeNull();
  });

  test('fills in every field once enough snapshots exist', () => {
    const stats = computePortfolioStats([
      { date: '2026-01-01', totalValueILS: 100 },
      { date: '2026-01-05', totalValueILS: 120 },
      { date: '2026-01-10', totalValueILS: 90 },
      { date: '2026-01-15', totalValueILS: 115 },
      { date: '2026-01-20', totalValueILS: 130 }
    ]);
    expect(stats.hasEnoughForRiskStats).toBe(true);
    expect(stats.snapshotsCount).toBe(5);
    expect(stats.firstDate).toBe('2026-01-01');
    expect(stats.lastDate).toBe('2026-01-20');
    expect(stats.maxDrawdownPercent).toBeCloseTo(25, 5); // 120 -> 90
    expect(typeof stats.volatilityPercent).toBe('number');
    expect(stats.bestPeriod).not.toBeNull();
    expect(stats.worstPeriod).not.toBeNull();
  });
});
