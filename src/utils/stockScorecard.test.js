import {
  computeValueChecks,
  computeFutureGrowthChecks,
  computePastPerformanceChecks,
  computeFinancialHealthChecks,
  computeOwnershipChecks,
  computeDividendChecks,
  computeStockVerdict,
  categoryPercent,
  buildStockScorecard
} from './stockScorecard';

// A realistic "good on paper" set of fundamentals, loosely modeled on the
// real KO/AAPL shapes captured during development (server/yahooQuotes.test.js
// has the exact captured responses) - not exact figures, just plausible ones
// chosen to exercise every check on both sides of its threshold.
const goodResearch = {
  trailingPE: 18,
  pegRatio: 0.8,
  priceToBook: 2.5,
  earningsGrowth: 0.15,
  revenueGrowth: 0.08,
  currentPrice: 100,
  targetMeanPrice: 120,
  currentRatio: 1.5,
  debtToEquity: 60,
  returnOnEquity: 0.2,
  operatingCashflow: 5000,
  totalDebt: 10000,
  heldPercentInsiders: 0.1,
  heldPercentInstitutions: 0.5,
  insiderRecentSales: 1,
  insiderRecentPurchases: 2,
  fundamentalsHistory: {
    // Round numbers with the same shape (rising EPS with one dip, then
    // acceleration; rising ROCE/ROA) as the real KO trend captured during
    // development, not the exact figures.
    annualDilutedEPS: [
      { date: '2021-12-31', value: 2.0 },
      { date: '2022-12-31', value: 2.2 },
      { date: '2023-12-31', value: 2.1 },
      { date: '2024-12-31', value: 3.0 }
    ],
    annualEBIT: [
      { date: '2021-12-31', value: 1000 },
      { date: '2024-12-31', value: 1300 }
    ],
    annualInvestedCapital: [
      { date: '2021-12-31', value: 5000 },
      { date: '2024-12-31', value: 5500 }
    ],
    annualNetIncome: [
      { date: '2021-12-31', value: 500 },
      { date: '2024-12-31', value: 700 }
    ],
    annualTotalAssets: [
      { date: '2021-12-31', value: 8000 },
      { date: '2024-12-31', value: 8500 }
    ]
  }
};

describe('computeValueChecks', () => {
  test('passes all checks for reasonable PE/PEG/PB', () => {
    const result = computeValueChecks(goodResearch);
    expect(result.passed).toBe(3);
    expect(result.total).toBe(3);
  });

  test('fails PE above the threshold, PEG above 1, PB above the threshold', () => {
    const result = computeValueChecks({ trailingPE: 40, pegRatio: 2.5, priceToBook: 8 });
    expect(result.passed).toBe(0);
    expect(result.total).toBe(3);
    expect(result.checks.find((c) => c.key === 'peReasonable').passed).toBe(false);
  });

  test('a negative PE (loss-making company) fails the check rather than passing on a false "small number"', () => {
    const result = computeValueChecks({ trailingPE: -12 });
    expect(result.checks.find((c) => c.key === 'peReasonable').passed).toBe(false);
  });

  test('missing fields produce null checks, excluded from passed/total', () => {
    const result = computeValueChecks({});
    expect(result.total).toBe(0);
    expect(result.checks.every((c) => c.passed === null)).toBe(true);
  });

  test('tolerates completely missing/undefined research', () => {
    expect(() => computeValueChecks(undefined)).not.toThrow();
    expect(computeValueChecks(undefined).total).toBe(0);
  });
});

describe('computeFutureGrowthChecks', () => {
  test('passes all 4 checks for strong positive growth and analyst upside', () => {
    const result = computeFutureGrowthChecks(goodResearch);
    expect(result.passed).toBe(4);
    expect(result.total).toBe(4);
  });

  test('fails growth checks for negative/shrinking projections', () => {
    const result = computeFutureGrowthChecks({ earningsGrowth: -0.05, revenueGrowth: -0.02 });
    expect(result.checks.find((c) => c.key === 'earningsGrowthPositive').passed).toBe(false);
    expect(result.checks.find((c) => c.key === 'revenueGrowthPositive').passed).toBe(false);
    expect(result.checks.find((c) => c.key === 'highGrowth').passed).toBe(false);
  });

  test('reuses computeUpsidePercent semantics: no upside data means null, not fail', () => {
    const result = computeFutureGrowthChecks({ earningsGrowth: 0.1 }); // no currentPrice/targetMeanPrice
    expect(result.checks.find((c) => c.key === 'analystUpside').passed).toBeNull();
  });
});

describe('computePastPerformanceChecks', () => {
  const rising = goodResearch.fundamentalsHistory;

  test('passes all 4 checks for rising EPS/ROCE/ROA, with EPS growth accelerating after a dip', () => {
    const result = computePastPerformanceChecks(rising);
    expect(result.passed).toBe(4);
    expect(result.total).toBe(4);
  });

  test('fails EPS growth and ROCE/ROA improvement for a declining company', () => {
    const declining = {
      annualDilutedEPS: [
        { date: '2021-12-31', value: 3.0 },
        { date: '2024-12-31', value: 2.0 }
      ],
      annualEBIT: [
        { date: '2021-12-31', value: 1300 },
        { date: '2024-12-31', value: 1000 }
      ],
      annualInvestedCapital: [
        { date: '2021-12-31', value: 5000 },
        { date: '2024-12-31', value: 5500 }
      ],
      annualNetIncome: [
        { date: '2021-12-31', value: 700 },
        { date: '2024-12-31', value: 500 }
      ],
      annualTotalAssets: [
        { date: '2021-12-31', value: 8000 },
        { date: '2024-12-31', value: 8500 }
      ]
    };
    const result = computePastPerformanceChecks(declining);
    expect(result.checks.find((c) => c.key === 'epsGrowth').passed).toBe(false);
    expect(result.checks.find((c) => c.key === 'roceImprovement').passed).toBe(false);
    expect(result.checks.find((c) => c.key === 'roaImprovement').passed).toBe(false);
  });

  test('fails EPS acceleration when the latest year grows slower than the historical average', () => {
    const decelerating = {
      annualDilutedEPS: [
        { date: '2021-12-31', value: 1.0 },
        { date: '2022-12-31', value: 1.5 }, // +50% YoY
        { date: '2023-12-31', value: 2.0 }, // +33% YoY
        { date: '2024-12-31', value: 2.1 } // +5% YoY - much slower than the ~29% average
      ]
    };
    const result = computePastPerformanceChecks(decelerating);
    expect(result.checks.find((c) => c.key === 'epsAcceleration').passed).toBe(false);
    // EPS growth itself still passes - 2.1 > 1.0 - deceleration is a separate signal
    expect(result.checks.find((c) => c.key === 'epsGrowth').passed).toBe(true);
  });

  test('ROCE/ROA ratio series only use dates present in both the numerator and denominator series', () => {
    const mismatchedDates = {
      annualEBIT: [
        { date: '2021-12-31', value: 1000 },
        { date: '2022-12-31', value: 1100 }, // no matching investedCapital point - excluded from the ratio series
        { date: '2024-12-31', value: 1300 }
      ],
      annualInvestedCapital: [
        { date: '2021-12-31', value: 5000 },
        { date: '2024-12-31', value: 5500 }
      ]
    };
    const result = computePastPerformanceChecks(mismatchedDates);
    // Still resolves to a valid 2-point comparison (2021 vs 2024), skipping the unmatched 2022 EBIT point
    expect(result.checks.find((c) => c.key === 'roceImprovement').passed).toBe(true);
  });

  test('does not divide by zero when a denominator value is 0 - that point is excluded, not Infinity', () => {
    const zeroDenominator = {
      annualEBIT: [
        { date: '2021-12-31', value: 1000 },
        { date: '2024-12-31', value: 1300 }
      ],
      annualInvestedCapital: [
        { date: '2021-12-31', value: 0 },
        { date: '2024-12-31', value: 5500 }
      ]
    };
    const result = computePastPerformanceChecks(zeroDenominator);
    // Only 1 usable point (2024) remains once the zero-denominator point is
    // dropped - not enough to compare "first vs last", so null, not a fail.
    expect(result.checks.find((c) => c.key === 'roceImprovement').passed).toBeNull();
  });

  test('returns all-null checks (not throwing) for missing/empty fundamentalsHistory', () => {
    expect(computePastPerformanceChecks(undefined).total).toBe(0);
    expect(computePastPerformanceChecks({}).total).toBe(0);
    expect(computePastPerformanceChecks({}).checks.every((c) => c.passed === null)).toBe(true);
  });

  test('EPS checks need at least 3 points for acceleration but only 2 for plain growth', () => {
    const twoPoints = { annualDilutedEPS: [{ date: '2023-12-31', value: 1 }, { date: '2024-12-31', value: 2 }] };
    const result = computePastPerformanceChecks(twoPoints);
    expect(result.checks.find((c) => c.key === 'epsGrowth').passed).toBe(true);
    expect(result.checks.find((c) => c.key === 'epsAcceleration').passed).toBeNull();
  });
});

describe('computeFinancialHealthChecks', () => {
  test('passes all checks for a healthy balance sheet', () => {
    const result = computeFinancialHealthChecks(goodResearch);
    expect(result.passed).toBe(4);
    expect(result.total).toBe(4);
  });

  test('fails current ratio ≤1, high debt/equity, weak cashflow coverage, low ROE', () => {
    const result = computeFinancialHealthChecks({
      currentRatio: 0.8,
      debtToEquity: 250,
      operatingCashflow: 500,
      totalDebt: 10000, // 5% coverage, well under 20%
      returnOnEquity: 0.05
    });
    expect(result.passed).toBe(0);
    expect(result.total).toBe(4);
  });

  test('does not divide by zero when totalDebt is 0 - coverage check is null, not Infinity', () => {
    const result = computeFinancialHealthChecks({ operatingCashflow: 500, totalDebt: 0 });
    const coverage = result.checks.find((c) => c.key === 'cashflowCoverage');
    expect(coverage.passed).toBeNull();
    expect(coverage.detail).toBeNull();
  });
});

describe('computeOwnershipChecks', () => {
  test('passes ownership-threshold checks and insider-net-buying when purchases >= sales', () => {
    const result = computeOwnershipChecks(goodResearch); // 2 purchases vs 1 sale
    expect(result.passed).toBe(3);
    expect(result.total).toBe(3);
  });

  test('fails insider-net-buying when sales outnumber purchases', () => {
    const result = computeOwnershipChecks({ insiderRecentSales: 5, insiderRecentPurchases: 1 });
    expect(result.checks.find((c) => c.key === 'insiderNetBuying').passed).toBe(false);
  });

  test('insider-net-buying is null (no signal) when there are zero sales AND zero purchases', () => {
    const result = computeOwnershipChecks({ insiderRecentSales: 0, insiderRecentPurchases: 0 });
    expect(result.checks.find((c) => c.key === 'insiderNetBuying').passed).toBeNull();
  });
});

describe('computeDividendChecks', () => {
  test('passes both checks for a sustainable dividend payer', () => {
    const result = computeDividendChecks({ dividendYieldPercent: 2.5, payoutRatio: 0.5 });
    expect(result.passed).toBe(2);
    expect(result.total).toBe(2);
  });

  test('fails "pays a dividend" for a zero-yield stock, without touching payoutRatio', () => {
    const result = computeDividendChecks({ dividendYieldPercent: 0, payoutRatio: null });
    expect(result.checks.find((c) => c.key === 'paysDividend').passed).toBe(false);
    expect(result.checks.find((c) => c.key === 'payoutSustainable').passed).toBeNull();
  });

  test('fails payout sustainability above 90% (unsustainable) and at/below 0%', () => {
    const tooHigh = computeDividendChecks({ dividendYieldPercent: 3, payoutRatio: 1.2 });
    expect(tooHigh.checks.find((c) => c.key === 'payoutSustainable').passed).toBe(false);
  });

  test('tolerates missing dividend data entirely (symbol not yet loaded)', () => {
    expect(computeDividendChecks(null).total).toBe(0);
    expect(computeDividendChecks(undefined).total).toBe(0);
  });
});

describe('categoryPercent', () => {
  test('computes passed/total as a percentage', () => {
    expect(categoryPercent({ passed: 3, total: 4 })).toBe(75);
  });

  test('returns null for a category with no applicable checks (would otherwise divide by zero)', () => {
    expect(categoryPercent({ passed: 0, total: 0 })).toBeNull();
    expect(categoryPercent(null)).toBeNull();
  });
});

describe('computeStockVerdict', () => {
  const allPassing = { value: { passed: 3, total: 3 }, financialHealth: { passed: 4, total: 4 } };
  const allFailing = { value: { passed: 0, total: 3 }, financialHealth: { passed: 0, total: 4 } };

  test('BUY when overall ≥65% and Value ≥50%', () => {
    expect(computeStockVerdict(allPassing).verdict).toBe('BUY');
  });

  test('HOLD (not BUY) when overall is high but Value itself is weak - a great company at a bad price', () => {
    const categories = { value: { passed: 0, total: 3 }, financialHealth: { passed: 4, total: 4 }, futureGrowth: { passed: 4, total: 4 } };
    const result = computeStockVerdict(categories);
    expect(result.verdict).toBe('HOLD');
    expect(result.overallPercent).toBeGreaterThanOrEqual(65); // confirms it's the Value guard, not the overall score, blocking BUY
  });

  test('SELL when the overall checks-passed rate is ≤35%', () => {
    expect(computeStockVerdict(allFailing).verdict).toBe('SELL');
  });

  test('SELL when Financial Health alone is ≤33%, even if the overall rate looks fine', () => {
    const categories = {
      financialHealth: { passed: 1, total: 4 }, // 25%
      value: { passed: 3, total: 3 },
      futureGrowth: { passed: 4, total: 4 }
    };
    const result = computeStockVerdict(categories);
    expect(result.verdict).toBe('SELL');
    expect(result.overallPercent).toBeGreaterThan(35); // confirms it's the Health override, not the overall rate
  });

  test('HOLD for a middling score that triggers neither the BUY nor SELL rule', () => {
    const categories = { value: { passed: 1, total: 3 }, financialHealth: { passed: 2, total: 4 } };
    expect(computeStockVerdict(categories).verdict).toBe('HOLD');
  });

  test('returns a null verdict (not a default HOLD) when there is no usable data at all', () => {
    const result = computeStockVerdict({ value: { passed: 0, total: 0 }, financialHealth: { passed: 0, total: 0 } });
    expect(result.verdict).toBeNull();
    expect(result.overallPercent).toBeNull();
  });

  test('tolerates missing category objects entirely', () => {
    expect(() => computeStockVerdict({})).not.toThrow();
    expect(computeStockVerdict({}).verdict).toBeNull();
  });
});

describe('buildStockScorecard', () => {
  test('combines all categories and a verdict for a fully-populated, healthy stock', () => {
    const scorecard = buildStockScorecard(goodResearch, { dividendYieldPercent: 2, payoutRatio: 0.4 });
    expect(Object.keys(scorecard.categories)).toEqual([
      'value',
      'futureGrowth',
      'pastPerformance',
      'financialHealth',
      'dividend',
      'ownership'
    ]);
    expect(scorecard.categories.pastPerformance.passed).toBe(4); // rising EPS/ROCE/ROA fixture - see goodResearch.fundamentalsHistory
    expect(scorecard.verdict.verdict).toBe('BUY');
  });

  test('handles a symbol with no research or dividend data yet loaded, without throwing', () => {
    const scorecard = buildStockScorecard(null, null);
    expect(scorecard.verdict.verdict).toBeNull();
    Object.values(scorecard.categories).forEach((c) => expect(c.total).toBe(0));
  });
});
