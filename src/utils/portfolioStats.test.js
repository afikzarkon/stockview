import {
  buildEquitySeries,
  buildSeriesFromHistoricalValues,
  computePeriodReturns,
  computeVolatilityPercent,
  computeBestWorstPeriod,
  computeTotalReturnPercent,
  computeAnnualizedReturnPercent,
  computeStatsFromSeries,
  computePortfolioStats,
  computeTimeWeightedReturnPercent,
  annualizeReturnPercent,
  TRADING_DAYS_PER_YEAR
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

// The dynamic performance curve's own shape (utils/historicalPortfolioValue.js
// returns {date, valueILS, isPartial}) - this is what performance is now
// computed from, instead of saved snapshots.
describe('buildSeriesFromHistoricalValues', () => {
  test('normalizes the historical-value shape and sorts by date', () => {
    const series = buildSeriesFromHistoricalValues([
      { date: '2026-01-08', valueILS: 1100, isPartial: false },
      { date: '2026-01-01', valueILS: 1000, isPartial: false }
    ]);
    expect(series).toEqual([
      { date: '2026-01-01', value: 1000 },
      { date: '2026-01-08', value: 1100 }
    ]);
  });

  test('drops dates the portfolio could not be valued on at all', () => {
    const series = buildSeriesFromHistoricalValues([
      { date: '2026-01-01', valueILS: null, isPartial: true },
      { date: '2026-01-08', valueILS: 0, isPartial: false },
      { date: '2026-01-15', valueILS: 1200, isPartial: false }
    ]);
    expect(series).toEqual([{ date: '2026-01-15', value: 1200 }]);
  });

  test('handles non-array input gracefully', () => {
    expect(buildSeriesFromHistoricalValues(null)).toEqual([]);
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

  test('a single point produces no returns', () => {
    const series = buildEquitySeries([{ date: '2026-01-01', totalValueILS: 100 }]);
    expect(computePeriodReturns(series)).toEqual([]);
  });
});

describe('computeVolatilityPercent', () => {
  test('needs at least two return periods (3 points) to compute anything', () => {
    const oneReturn = computePeriodReturns(
      buildEquitySeries([
        { date: '2026-01-01', totalValueILS: 100 },
        { date: '2026-01-02', totalValueILS: 105 }
      ])
    );
    expect(computeVolatilityPercent(oneReturn)).toBeNull();
  });

  test('a perfectly steady growth series has ~0 volatility', () => {
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
    expect(computeVolatilityPercent(bumpyReturns)).toBeGreaterThan(0);
  });

  // The audited definition: sample stdev of the daily-equivalent returns,
  // annualized by sqrt(252). Pinned numerically so a change to either half
  // of that formula is caught rather than silently shifting every
  // volatility figure the app displays.
  test('annualizes the daily-equivalent standard deviation by sqrt(252)', () => {
    // Daily points, so each period's daily-equivalent return IS its return:
    // +10%, -10%, +10%. Mean = 0.0333..., sample stdev (n-1) over the three.
    const returns = computePeriodReturns(
      buildEquitySeries([
        { date: '2026-01-01', totalValueILS: 100 },
        { date: '2026-01-02', totalValueILS: 110 },
        { date: '2026-01-03', totalValueILS: 99 },
        { date: '2026-01-04', totalValueILS: 108.9 }
      ])
    );
    const dailyEquivalents = [0.1, -0.1, 0.1];
    const mean = dailyEquivalents.reduce((s, v) => s + v, 0) / 3;
    const variance = dailyEquivalents.reduce((s, v) => s + (v - mean) ** 2, 0) / 2;
    const expected = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;

    expect(computeVolatilityPercent(returns)).toBeCloseTo(expected, 6);
  });

  // Compounding a long gap down to a daily-equivalent return smooths away
  // the movement inside it. This is why the inputs must come from a
  // regularly-sampled price series and not from whenever the app happened
  // to be opened - the assertion documents the direction of that bias.
  test('irregular, widely-spaced sampling understates volatility versus daily sampling', () => {
    const daily = computePeriodReturns(
      buildEquitySeries([
        { date: '2026-01-01', totalValueILS: 100 },
        { date: '2026-01-02', totalValueILS: 110 },
        { date: '2026-01-03', totalValueILS: 99 },
        { date: '2026-01-04', totalValueILS: 108.9 }
      ])
    );
    const sparse = computePeriodReturns(
      buildEquitySeries([
        { date: '2026-01-01', totalValueILS: 100 },
        { date: '2026-02-01', totalValueILS: 110 },
        { date: '2026-03-01', totalValueILS: 99 },
        { date: '2026-04-01', totalValueILS: 108.9 }
      ])
    );
    expect(computeVolatilityPercent(sparse)).toBeLessThan(computeVolatilityPercent(daily));
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

describe('computeTotalReturnPercent / computeAnnualizedReturnPercent', () => {
  test('total return is first-to-last, regardless of the path taken between', () => {
    const series = [
      { date: '2024-01-01', value: 1000 },
      { date: '2024-06-01', value: 500 },
      { date: '2025-01-01', value: 1200 }
    ];
    expect(computeTotalReturnPercent(series)).toBeCloseTo(20, 5);
  });

  test('annualized return compounds the total return over the elapsed years', () => {
    // Exactly two years (2024 is a leap year: 366 + 365 = 731 days),
    // doubling in value -> sqrt(2) - 1 per year.
    const series = [
      { date: '2024-01-01', value: 1000 },
      { date: '2026-01-01', value: 2000 }
    ];
    const years = 731 / 365;
    expect(computeAnnualizedReturnPercent(series)).toBeCloseTo((Math.pow(2, 1 / years) - 1) * 100, 4);
  });

  test('annualizing is withheld for a period under a month, where it would just extrapolate noise', () => {
    const series = [
      { date: '2026-01-01', value: 1000 },
      { date: '2026-01-08', value: 1020 }
    ];
    expect(computeTotalReturnPercent(series)).toBeCloseTo(2, 5);
    expect(computeAnnualizedReturnPercent(series)).toBeNull();
  });

  test('both are null when there is nothing meaningful to divide by', () => {
    expect(computeTotalReturnPercent([{ date: '2026-01-01', value: 100 }])).toBeNull();
    expect(computeTotalReturnPercent([{ date: '2026-01-01', value: 0 }, { date: '2026-01-02', value: 5 }])).toBeNull();
    expect(computeAnnualizedReturnPercent([])).toBeNull();
  });
});

describe('computeStatsFromSeries', () => {
  test('reports hasHistory=false and null stats with fewer than 2 points', () => {
    const stats = computeStatsFromSeries([{ date: '2026-01-01', value: 100 }]);
    expect(stats.hasHistory).toBe(false);
    expect(stats.hasEnoughForRiskStats).toBe(false);
    expect(stats.totalReturnPercent).toBeNull();
    expect(stats.volatilityPercent).toBeNull();
  });

  test('computes the return since inception once there are 2+ points, before risk stats are meaningful', () => {
    const stats = computeStatsFromSeries([
      { date: '2026-01-01', value: 100 },
      { date: '2026-01-15', value: 110 }
    ]);
    expect(stats.hasHistory).toBe(true);
    expect(stats.hasEnoughForRiskStats).toBe(false); // needs >= 5 points
    expect(stats.totalReturnPercent).toBeCloseTo(10, 5);
    expect(stats.volatilityPercent).toBeNull();
  });

  test('fills in every field once enough points exist', () => {
    const stats = computeStatsFromSeries([
      { date: '2026-01-01', value: 100 },
      { date: '2026-01-05', value: 120 },
      { date: '2026-01-10', value: 90 },
      { date: '2026-01-15', value: 115 },
      { date: '2026-01-20', value: 130 }
    ]);
    expect(stats.hasEnoughForRiskStats).toBe(true);
    expect(stats.snapshotsCount).toBe(5);
    expect(stats.firstDate).toBe('2026-01-01');
    expect(stats.lastDate).toBe('2026-01-20');
    expect(typeof stats.volatilityPercent).toBe('number');
    expect(stats.bestPeriod).not.toBeNull();
    expect(stats.worstPeriod).not.toBeNull();
  });

  // The removed metrics: max drawdown and the Sharpe ratio are gone from
  // the analysis module entirely, so nothing may still be computing or
  // reporting them.
  test('no longer reports max drawdown or a Sharpe ratio', () => {
    const stats = computeStatsFromSeries([
      { date: '2026-01-01', value: 100 },
      { date: '2026-01-05', value: 120 },
      { date: '2026-01-10', value: 90 }
    ]);
    expect(stats).not.toHaveProperty('maxDrawdownPercent');
    expect(stats).not.toHaveProperty('drawdownPeakDate');
    expect(stats).not.toHaveProperty('drawdownTroughDate');
    expect(stats).not.toHaveProperty('sharpeRatio');
  });

  test('the return since inception is read off the same series the chart draws', () => {
    const historical = [
      { date: '2024-01-01', valueILS: 50000, isPartial: false },
      { date: '2024-07-01', valueILS: 62000, isPartial: false },
      { date: '2025-01-01', valueILS: 75000, isPartial: false }
    ];
    const stats = computeStatsFromSeries(buildSeriesFromHistoricalValues(historical));
    expect(stats.firstDate).toBe('2024-01-01');
    expect(stats.totalReturnPercent).toBeCloseTo(50, 5);
    expect(stats.series[stats.series.length - 1].value).toBe(75000);
  });
});

describe('computePortfolioStats (saved-snapshot entry point)', () => {
  test('still works on raw snapshot rows, for the checkpoint side of the app', () => {
    const stats = computePortfolioStats([
      { date: '2026-01-01', totalValueILS: 100 },
      { date: '2026-01-15', totalValueILS: 110 }
    ]);
    expect(stats.hasHistory).toBe(true);
    expect(stats.totalReturnPercent).toBeCloseTo(10, 5);
  });
});

// The requirement: a "return" must reflect what the assets did, not how
// much money was paid into them.
describe('computeTimeWeightedReturnPercent', () => {
  test('a pure deposit produces 0% return, not the apparent growth in value', () => {
    // 100k -> 150k, but 50k of that was deposited. Nothing was earned.
    const series = [
      { date: '2024-01-01', value: 100000 },
      { date: '2024-02-01', value: 150000 }
    ];
    const flows = [{ date: '2024-01-15', amount: 50000 }];
    expect(computeTimeWeightedReturnPercent(series, flows)).toBeCloseTo(0, 6);
    // The un-neutralized figure is the misleading one this replaces.
    expect(computeTotalReturnPercent(series)).toBeCloseTo(50, 6);
  });

  test('a withdrawal does not read as a loss', () => {
    const series = [
      { date: '2024-01-01', value: 100000 },
      { date: '2024-02-01', value: 80000 }
    ];
    const flows = [{ date: '2024-01-15', amount: -20000 }];
    expect(computeTimeWeightedReturnPercent(series, flows)).toBeCloseTo(0, 6);
    expect(computeTotalReturnPercent(series)).toBeCloseTo(-20, 6);
  });

  test('with no cash flows at all it agrees with the plain value change', () => {
    const series = [
      { date: '2024-01-01', value: 100 },
      { date: '2024-02-01', value: 110 },
      { date: '2024-03-01', value: 121 }
    ];
    expect(computeTimeWeightedReturnPercent(series, [])).toBeCloseTo(21, 6);
    expect(computeTotalReturnPercent(series)).toBeCloseTo(21, 6);
  });

  test('separates real growth from a contribution made in the same period', () => {
    // 100k grows 10% to 110k, and 50k is deposited at the very end of the
    // period (so it earned nothing within it).
    const series = [
      { date: '2024-01-01', value: 100000 },
      { date: '2024-02-01', value: 160000 }
    ];
    const flows = [{ date: '2024-02-01', amount: 50000 }];
    expect(computeTimeWeightedReturnPercent(series, flows)).toBeCloseTo(10, 6);
  });

  // Chaining is what makes it time-weighted: the size of the contribution
  // must not change the measured performance.
  test('the same market performance yields the same return regardless of how much was contributed', () => {
    const build = (deposit) => [
      { date: '2024-01-01', value: 10000 },
      { date: '2024-02-01', value: 11000 + deposit },
      { date: '2024-03-01', value: (11000 + deposit) * 1.05 }
    ];
    const small = computeTimeWeightedReturnPercent(build(1000), [{ date: '2024-02-01', amount: 1000 }]);
    const large = computeTimeWeightedReturnPercent(build(900000), [{ date: '2024-02-01', amount: 900000 }]);
    expect(small).toBeCloseTo(large, 6);
    // 10% then 5% chained.
    expect(small).toBeCloseTo((1.1 * 1.05 - 1) * 100, 6);
  });

  test('a portfolio funded from empty reports the growth after funding, not the funding itself', () => {
    const series = [
      { date: '2024-01-01', value: 0 },
      { date: '2024-02-01', value: 10000 },
      { date: '2024-03-01', value: 11000 }
    ];
    const flows = [{ date: '2024-01-15', amount: 10000 }];
    expect(computeTimeWeightedReturnPercent(series, flows)).toBeCloseTo(10, 6);
  });

  test('needs at least two points to mean anything', () => {
    expect(computeTimeWeightedReturnPercent([{ date: '2024-01-01', value: 100 }], [])).toBeNull();
    expect(computeTimeWeightedReturnPercent([], [])).toBeNull();
    expect(computeTimeWeightedReturnPercent(null, [])).toBeNull();
  });
});

describe('computeStatsFromSeries with cash flows', () => {
  const series = [
    { date: '2024-01-01', value: 100000 },
    { date: '2024-07-01', value: 150000 }
  ];
  const flows = [{ date: '2024-03-01', amount: 50000 }];

  test('reports the neutralized figure as the headline return, and keeps the raw one alongside it', () => {
    const stats = computeStatsFromSeries(series, flows);
    expect(stats.totalReturnPercent).toBeCloseTo(stats.timeWeightedReturnPercent, 10);
    expect(stats.totalReturnPercent).toBeLessThan(10);
    expect(stats.naiveReturnPercent).toBeCloseTo(50, 6);
    expect(stats.netCashFlow).toBe(50000);
    expect(stats.isCashFlowNeutralized).toBe(true);
  });

  test('annualizes the neutralized figure, not the raw value change', () => {
    const stats = computeStatsFromSeries(series, flows);
    const expected = annualizeReturnPercent(series, stats.totalReturnPercent);
    expect(stats.annualizedReturnPercent).toBeCloseTo(expected, 10);
    expect(stats.annualizedReturnPercent).not.toBeCloseTo(
      annualizeReturnPercent(series, stats.naiveReturnPercent),
      3
    );
  });

  test('without cash flows the two figures agree and nothing claims to be neutralized', () => {
    const stats = computeStatsFromSeries(series, []);
    expect(stats.totalReturnPercent).toBeCloseTo(50, 6);
    expect(stats.naiveReturnPercent).toBeCloseTo(50, 6);
    expect(stats.netCashFlow).toBe(0);
  });
});
