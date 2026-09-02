import { computeDcfFairValue } from './dcfValuation';

const fundamentalsHistory = {
  annualFreeCashFlow: [
    { date: '2022-12-31', value: 1000000000 },
    { date: '2023-12-31', value: 1100000000 },
    { date: '2024-12-31', value: 1200000000 }
  ]
};

const baseResearch = {
  beta: 1.0,
  sharesOutstanding: 100000000,
  currentPrice: 50,
  nextYearEarningsGrowth: 0.08
};

describe('computeDcfFairValue', () => {
  test('computes a positive fair value and margin of safety for healthy inputs', () => {
    const result = computeDcfFairValue(baseResearch, fundamentalsHistory);
    expect(result).not.toBeNull();
    expect(result.fairValuePerShare).toBeGreaterThan(0);
    expect(result.currentPrice).toBe(50);
    expect(result.marginOfSafetyPercent).toBe(
      ((result.fairValuePerShare - 50) / result.fairValuePerShare) * 100
    );
    expect(result.assumptions.discountRate).toBeCloseTo(0.04 + 1.0 * 0.055, 6);
    expect(result.assumptions.growthRate).toBe(0.08);
  });

  test('falls back to earningsGrowth when nextYearEarningsGrowth is missing', () => {
    const research = { ...baseResearch, nextYearEarningsGrowth: null, earningsGrowth: 0.12 };
    const result = computeDcfFairValue(research, fundamentalsHistory);
    expect(result).not.toBeNull();
    expect(result.assumptions.growthRate).toBe(0.12);
  });

  test('clamps an extreme growth rate rather than extrapolating it', () => {
    const research = { ...baseResearch, nextYearEarningsGrowth: 5 }; // 500%
    const result = computeDcfFairValue(research, fundamentalsHistory);
    expect(result).not.toBeNull();
    expect(result.assumptions.growthRate).toBe(0.3);
  });

  test('defaults growth to 0 when no growth estimate is available at all', () => {
    const research = { ...baseResearch, nextYearEarningsGrowth: null, earningsGrowth: null };
    const result = computeDcfFairValue(research, fundamentalsHistory);
    expect(result).not.toBeNull();
    expect(result.assumptions.growthRate).toBe(0);
  });

  test('returns null when beta is missing', () => {
    const research = { ...baseResearch, beta: null };
    expect(computeDcfFairValue(research, fundamentalsHistory)).toBeNull();
  });

  test('returns null when sharesOutstanding is missing or zero', () => {
    expect(computeDcfFairValue({ ...baseResearch, sharesOutstanding: null }, fundamentalsHistory)).toBeNull();
    expect(computeDcfFairValue({ ...baseResearch, sharesOutstanding: 0 }, fundamentalsHistory)).toBeNull();
  });

  test('returns null when the latest free cash flow is missing', () => {
    expect(computeDcfFairValue(baseResearch, {})).toBeNull();
    expect(computeDcfFairValue(baseResearch, { annualFreeCashFlow: [] })).toBeNull();
  });

  test('returns null when the latest free cash flow is negative or zero', () => {
    const negativeFcf = { annualFreeCashFlow: [{ date: '2024-12-31', value: -500000000 }] };
    expect(computeDcfFairValue(baseResearch, negativeFcf)).toBeNull();
    const zeroFcf = { annualFreeCashFlow: [{ date: '2024-12-31', value: 0 }] };
    expect(computeDcfFairValue(baseResearch, zeroFcf)).toBeNull();
  });

  test('returns null when the discount rate does not exceed the terminal growth rate (very low beta)', () => {
    // discountRate = 0.04 + beta*0.055; needs to be <= 0.025 (TERMINAL_GROWTH_RATE)
    const research = { ...baseResearch, beta: -0.3 };
    expect(computeDcfFairValue(research, fundamentalsHistory)).toBeNull();
  });

  test('handles a missing currentPrice by returning a null margin of safety, not a null result', () => {
    const research = { ...baseResearch, currentPrice: null };
    const result = computeDcfFairValue(research, fundamentalsHistory);
    expect(result).not.toBeNull();
    expect(result.currentPrice).toBeNull();
    expect(result.marginOfSafetyPercent).toBeNull();
  });
});
