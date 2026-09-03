import {
  REBALANCE_CATEGORIES,
  emptyTargets,
  sumTargetPercents,
  isValidTargetAllocation,
  computeRebalancingPlan
} from './rebalancing';

const distribution = (overrides) => ({
  israeli: { value: 4000, percentage: 40 },
  american: { value: 4000, percentage: 40 },
  pension: { value: 1000, percentage: 10 },
  cashFunds: { value: 500, percentage: 5 },
  bank: { value: 500, percentage: 5 },
  bankSavings: { value: 0, percentage: 0 },
  total: 10000,
  ...overrides
});

describe('emptyTargets', () => {
  test('has all categories at 0', () => {
    const targets = emptyTargets();
    expect(Object.keys(targets).sort()).toEqual([...REBALANCE_CATEGORIES].sort());
    REBALANCE_CATEGORIES.forEach((key) => expect(targets[key]).toBe(0));
  });
});

describe('sumTargetPercents / isValidTargetAllocation', () => {
  test('sums all category percentages', () => {
    const targets = { israeli: 40, american: 40, pension: 10, cashFunds: 5, bank: 5 };
    expect(sumTargetPercents(targets)).toBe(100);
    expect(isValidTargetAllocation(targets)).toBe(true);
  });

  test('rejects allocations that do not sum to ~100', () => {
    const targets = { israeli: 40, american: 40, pension: 10, cashFunds: 5, bank: 0 };
    expect(sumTargetPercents(targets)).toBe(95);
    expect(isValidTargetAllocation(targets)).toBe(false);
  });

  test('tolerates small rounding error', () => {
    const targets = { israeli: 33.34, american: 33.33, pension: 33.33, cashFunds: 0, bank: 0 };
    expect(isValidTargetAllocation(targets)).toBe(true);
  });

  test('missing/non-numeric values treated as 0', () => {
    expect(sumTargetPercents({ israeli: 40 })).toBe(40);
    expect(sumTargetPercents({ israeli: 'abc', american: 60 })).toBe(60);
    expect(sumTargetPercents({})).toBe(0);
    expect(sumTargetPercents(undefined)).toBe(0);
  });
});

describe('computeRebalancingPlan', () => {
  test('a portfolio already at target has zero diffs', () => {
    const targets = { israeli: 40, american: 40, pension: 10, cashFunds: 5, bank: 5 };
    const plan = computeRebalancingPlan(distribution(), targets);
    plan.rows.forEach((row) => {
      expect(row.diffValue).toBeCloseTo(0, 5);
      expect(row.diffPercent).toBeCloseTo(0, 5);
    });
    expect(plan.maxAbsDiffPercent).toBeCloseTo(0, 5);
    expect(plan.isValidAllocation).toBe(true);
  });

  test('overweight category gets a negative diffValue (sell), underweight gets positive (buy)', () => {
    // Actual: israeli 40%, american 40%. Target: israeli 20%, american 60%.
    const targets = { israeli: 20, american: 60, pension: 10, cashFunds: 5, bank: 5 };
    const plan = computeRebalancingPlan(distribution(), targets);
    const israeliRow = plan.rows.find((r) => r.key === 'israeli');
    const americanRow = plan.rows.find((r) => r.key === 'american');

    // israeli: current 4000 (40%), target 20% of 10000 = 2000 -> diff -2000 (sell)
    expect(israeliRow.targetValue).toBe(2000);
    expect(israeliRow.diffValue).toBe(-2000);
    expect(israeliRow.diffPercent).toBe(-20);

    // american: current 4000 (40%), target 60% of 10000 = 6000 -> diff +2000 (buy)
    expect(americanRow.targetValue).toBe(6000);
    expect(americanRow.diffValue).toBe(2000);
    expect(americanRow.diffPercent).toBe(20);
  });

  test('maxAbsDiffPercent picks the single largest category deviation', () => {
    const targets = { israeli: 10, american: 70, pension: 10, cashFunds: 5, bank: 5 };
    const plan = computeRebalancingPlan(distribution(), targets);
    // israeli: |10-40|=30, american: |70-40|=30 -> max is 30
    expect(plan.maxAbsDiffPercent).toBeCloseTo(30, 5);
  });

  test('handles an empty/zero portfolio without throwing', () => {
    const emptyDist = { israeli: { value: 0, percentage: 0 }, american: { value: 0, percentage: 0 }, pension: { value: 0, percentage: 0 }, cashFunds: { value: 0, percentage: 0 }, bank: { value: 0, percentage: 0 }, bankSavings: { value: 0, percentage: 0 }, total: 0 };
    const plan = computeRebalancingPlan(emptyDist, emptyTargets());
    expect(plan.totalValueILS).toBe(0);
    expect(plan.rows).toHaveLength(REBALANCE_CATEGORIES.length);
    plan.rows.forEach((row) => expect(row.targetValue).toBe(0));
  });

  test('handles missing/undefined exchangeDistribution gracefully', () => {
    expect(() => computeRebalancingPlan(undefined, emptyTargets())).not.toThrow();
    const plan = computeRebalancingPlan(undefined, emptyTargets());
    expect(plan.totalValueILS).toBe(0);
    expect(plan.rows).toHaveLength(REBALANCE_CATEGORIES.length);
  });
});
