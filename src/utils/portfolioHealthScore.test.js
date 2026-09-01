import {
  averageAbsCorrelation,
  computePortfolioHealthScore,
  healthScoreLabelHe
} from './portfolioHealthScore';

describe('averageAbsCorrelation', () => {
  test('averages the absolute value of every pair, ignoring the diagonal and nulls', () => {
    const symbols = ['A', 'B', 'C'];
    const matrix = [
      [1, 0.5, null],
      [0.5, 1, -0.3],
      [null, -0.3, 1]
    ];
    // pairs: |0.5|, |-0.3| -> (0.5 + 0.3) / 2 = 0.4
    expect(averageAbsCorrelation(symbols, matrix)).toBeCloseTo(0.4, 6);
  });

  test('returns null when no pair has a value', () => {
    const symbols = ['A', 'B'];
    const matrix = [
      [1, null],
      [null, 1]
    ];
    expect(averageAbsCorrelation(symbols, matrix)).toBeNull();
  });

  test('handles missing/empty input without throwing', () => {
    expect(averageAbsCorrelation([], [])).toBeNull();
    expect(averageAbsCorrelation(null, null)).toBeNull();
  });
});

describe('healthScoreLabelHe', () => {
  test('maps score bands to labels', () => {
    expect(healthScoreLabelHe(95)).toBe('מצוין');
    expect(healthScoreLabelHe(80)).toBe('מצוין');
    expect(healthScoreLabelHe(65)).toBe('טוב');
    expect(healthScoreLabelHe(45)).toBe('בינוני');
    expect(healthScoreLabelHe(10)).toBe('טעון שיפור');
  });

  test('returns the no-data label for null/undefined', () => {
    expect(healthScoreLabelHe(null)).toBe('אין מספיק נתונים');
    expect(healthScoreLabelHe(undefined)).toBe('אין מספיק נתונים');
  });
});

describe('computePortfolioHealthScore', () => {
  test('scores every sub-metric at its best case as 100 and averages to 100', () => {
    const result = computePortfolioHealthScore({
      concentrationTop3Percent: 0,
      topSectorPercent: 0,
      correlationSymbols: ['A', 'B'],
      correlationMatrix: [
        [1, 0],
        [0, 1]
      ],
      volatilityPercent: 0,
      maxDrawdownPercent: 0,
      allocationMaxAbsDiffPercent: 0
    });
    expect(result.overallScore).toBe(100);
    expect(result.breakdown).toEqual({
      concentration: 100,
      sectorConcentration: 100,
      correlation: 100,
      volatility: 100,
      drawdown: 100,
      allocationDrift: 100
    });
    expect(result.availableCount).toBe(6);
  });

  test('scores every sub-metric at/beyond its worst-case reference as 0', () => {
    const result = computePortfolioHealthScore({
      concentrationTop3Percent: 100,
      topSectorPercent: 100,
      correlationSymbols: ['A', 'B'],
      correlationMatrix: [
        [1, 1],
        [1, 1]
      ],
      volatilityPercent: 40,
      maxDrawdownPercent: 50,
      allocationMaxAbsDiffPercent: 30
    });
    expect(result.overallScore).toBe(0);
    Object.values(result.breakdown).forEach((v) => expect(v).toBe(0));
  });

  test('clamps a metric worse than its reference range to 0 instead of going negative', () => {
    const result = computePortfolioHealthScore({
      volatilityPercent: 90, // far past the 40% reference max
      maxDrawdownPercent: 95 // far past the 50% reference max
    });
    expect(result.breakdown.volatility).toBe(0);
    expect(result.breakdown.drawdown).toBe(0);
  });

  test('excludes sub-scores with missing data from both the breakdown value and the average', () => {
    const result = computePortfolioHealthScore({
      concentrationTop3Percent: 20, // -> score 80
      topSectorPercent: null, // no American stocks -> excluded
      correlationSymbols: [], // fewer than 2 -> excluded
      correlationMatrix: [],
      volatilityPercent: null, // not enough snapshot history -> excluded
      maxDrawdownPercent: null,
      allocationMaxAbsDiffPercent: null // no rebalancing targets set -> excluded
    });
    expect(result.breakdown.concentration).toBe(80);
    expect(result.breakdown.sectorConcentration).toBeNull();
    expect(result.breakdown.correlation).toBeNull();
    expect(result.breakdown.volatility).toBeNull();
    expect(result.breakdown.drawdown).toBeNull();
    expect(result.breakdown.allocationDrift).toBeNull();
    expect(result.overallScore).toBe(80); // average of just the one available sub-score
    expect(result.availableCount).toBe(1);
  });

  test('returns a null overall score (not 0 or NaN) when nothing is available at all', () => {
    const result = computePortfolioHealthScore({});
    expect(result.overallScore).toBeNull();
    expect(result.availableCount).toBe(0);
  });

  test('handles being called with no arguments at all', () => {
    const result = computePortfolioHealthScore();
    expect(result.overallScore).toBeNull();
  });
});
