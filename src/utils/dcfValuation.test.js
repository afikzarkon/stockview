import { computeDcfFairValue, computeDcfFairValueHistory, mergeFairValueIntoPriceHistory } from './dcfValuation';

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
    // a steady, all-positive FCF history is a normal-confidence case
    expect(result.isLowConfidence).toBe(false);
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

  describe('isLowConfidence: flags a genuinely volatile/cyclical reported FCF history', () => {
    // Real Micron (MU) figures, captured live: fiscal-year FCF swinging
    // +$3.1B -> -$6.1B -> +$0.12B -> +$1.7B. Using only the latest year
    // ($1.668B) as the DCF base badly understates a business mid-recovery
    // (real analyst next-year growth estimate here was +111%, clamped to
    // this model's 30% ceiling) - this is the case that should be flagged.
    const cyclicalFundamentals = {
      annualFreeCashFlow: [
        { date: '2022-08-31', value: 3114000000 },
        { date: '2023-08-31', value: -6117000000 },
        { date: '2024-08-31', value: 121000000 },
        { date: '2025-08-31', value: 1668000000 }
      ]
    };
    const cyclicalResearch = {
      beta: 2.222,
      sharesOutstanding: 1129393151,
      marketCap: 1129393151 * 956.08,
      currentPrice: 956.08,
      nextYearEarningsGrowth: 1.112
    };

    test('true when the FCF history includes a negative/zero year, even though the latest year alone is positive', () => {
      const result = computeDcfFairValue(cyclicalResearch, cyclicalFundamentals);
      expect(result).not.toBeNull();
      expect(result.isLowConfidence).toBe(true);
      // still returns a real (if low-confidence) number - never hides it
      expect(result.fairValuePerShare).toBeGreaterThan(0);
    });

    test('false when only the single most-recent year is considered, but true once a negative year is anywhere in the lookback window', () => {
      const onlyLatestYear = { annualFreeCashFlow: [cyclicalFundamentals.annualFreeCashFlow[3]] };
      expect(computeDcfFairValue(cyclicalResearch, onlyLatestYear).isLowConfidence).toBe(false);
      expect(computeDcfFairValue(cyclicalResearch, cyclicalFundamentals).isLowConfidence).toBe(true);
    });

    test('a zero-value year also counts as volatile, not just a negative one', () => {
      const withZeroYear = {
        annualFreeCashFlow: [
          { date: '2023-12-31', value: 0 },
          { date: '2024-12-31', value: 1000000000 }
        ]
      };
      expect(computeDcfFairValue(baseResearch, withZeroYear).isLowConfidence).toBe(true);
    });
  });

  describe('shares outstanding: prefers marketCap / currentPrice over a possibly-stale reported figure', () => {
    test('uses the implied share count from marketCap when available, ignoring a wildly different reported sharesOutstanding', () => {
      // Reproduces the real observed bug: sharesOutstanding stale/wrong by
      // ~30x (e.g. a lagged pre-split count) made fair value come out
      // absurdly low relative to currentPrice. marketCap is always
      // currentPrice x the *real* current share count, so it should win.
      const research = {
        ...baseResearch,
        currentPrice: 950,
        marketCap: 950 * 3_000_000, // implies 3,000,000 shares
        sharesOutstanding: 3_000_000 * 30 // a stale count 30x too high
      };
      const withMarketCap = computeDcfFairValue(research, fundamentalsHistory);
      const withoutMarketCap = computeDcfFairValue(
        { ...research, marketCap: null, currentPrice: 50 }, // same stale shares count, no marketCap to correct it
        fundamentalsHistory
      );
      expect(withMarketCap).not.toBeNull();
      expect(withoutMarketCap).not.toBeNull();
      // same FCF/discount-rate inputs, only the effective share count
      // differs (3,000,000 vs 90,000,000) - the corrected result must be
      // materially higher per share, not off by orders of magnitude
      expect(withMarketCap.fairValuePerShare).toBeGreaterThan(withoutMarketCap.fairValuePerShare * 10);
    });

    test('falls back to the reported sharesOutstanding when marketCap is missing', () => {
      const research = { ...baseResearch, marketCap: null };
      const result = computeDcfFairValue(research, fundamentalsHistory);
      const withoutMarketCapField = computeDcfFairValue(baseResearch, fundamentalsHistory);
      expect(result).not.toBeNull();
      expect(result.fairValuePerShare).toBe(withoutMarketCapField.fairValuePerShare);
    });

    test('falls back to the reported sharesOutstanding when currentPrice is missing (marketCap/price would be undefined)', () => {
      const research = { ...baseResearch, currentPrice: null, marketCap: 5_000_000_000 };
      const result = computeDcfFairValue(research, fundamentalsHistory);
      expect(result).not.toBeNull();
      expect(result.fairValuePerShare).toBeGreaterThan(0);
    });
  });
});

describe('computeDcfFairValueHistory', () => {
  test('returns one point per reported FCF year, using each year\'s own FCF with today\'s other assumptions held fixed', () => {
    const history = computeDcfFairValueHistory(baseResearch, fundamentalsHistory);
    expect(history).toHaveLength(3);
    expect(history.map((p) => p.date)).toEqual(['2022-12-31', '2023-12-31', '2024-12-31']);
    history.forEach((p) => expect(p.fairValuePerShare).toBeGreaterThan(0));
    // a higher reported FCF that year should produce a higher fair value
    // for that point (fcfSeries is increasing: 1.0B -> 1.1B -> 1.2B)
    expect(history[1].fairValuePerShare).toBeGreaterThan(history[0].fairValuePerShare);
    expect(history[2].fairValuePerShare).toBeGreaterThan(history[1].fairValuePerShare);
  });

  test("the latest point matches computeDcfFairValue's own result (same formula, same latest FCF)", () => {
    const history = computeDcfFairValueHistory(baseResearch, fundamentalsHistory);
    const single = computeDcfFairValue(baseResearch, fundamentalsHistory);
    expect(history[history.length - 1].fairValuePerShare).toBeCloseTo(single.fairValuePerShare, 6);
  });

  test('skips a year whose reported FCF is negative or zero, rather than fabricating a point for it', () => {
    const historyWithABadYear = {
      annualFreeCashFlow: [
        { date: '2022-12-31', value: -200000000 },
        { date: '2023-12-31', value: 0 },
        { date: '2024-12-31', value: 1200000000 }
      ]
    };
    const result = computeDcfFairValueHistory(baseResearch, historyWithABadYear);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2024-12-31');
  });

  test('returns an empty array when there is no FCF series at all', () => {
    expect(computeDcfFairValueHistory(baseResearch, {})).toEqual([]);
    expect(computeDcfFairValueHistory(baseResearch, { annualFreeCashFlow: [] })).toEqual([]);
  });

  test('returns an empty array when beta or shares outstanding is missing (same guard as computeDcfFairValue)', () => {
    expect(computeDcfFairValueHistory({ ...baseResearch, beta: null }, fundamentalsHistory)).toEqual([]);
    expect(computeDcfFairValueHistory({ ...baseResearch, sharesOutstanding: null }, fundamentalsHistory)).toEqual([]);
  });

  test('also prefers marketCap / currentPrice for shares outstanding, same as computeDcfFairValue', () => {
    const research = {
      ...baseResearch,
      currentPrice: 950,
      marketCap: 950 * 3_000_000,
      sharesOutstanding: 3_000_000 * 30
    };
    const withMarketCap = computeDcfFairValueHistory(research, fundamentalsHistory);
    const withoutMarketCap = computeDcfFairValueHistory(
      { ...research, marketCap: null, currentPrice: 50 },
      fundamentalsHistory
    );
    const last = (arr) => arr[arr.length - 1].fairValuePerShare;
    expect(last(withMarketCap)).toBeGreaterThan(last(withoutMarketCap) * 10);
  });
});

describe('mergeFairValueIntoPriceHistory', () => {
  const priceHistory = [
    { date: '2023-06-01', close: 40 },
    { date: '2023-12-31', close: 45 },
    { date: '2024-01-15', close: 46 },
    { date: '2024-12-31', close: 55 },
    { date: '2025-03-01', close: 60 }
  ];
  const fairValueHistory = [
    { date: '2023-12-31', fairValuePerShare: 42 },
    { date: '2024-12-31', fairValuePerShare: 50 }
  ];

  test('carries each fair-value point forward onto every later daily price point, until the next one', () => {
    const merged = mergeFairValueIntoPriceHistory(priceHistory, fairValueHistory);
    expect(merged.map((p) => p.fairValue)).toEqual([null, 42, 42, 50, 50]);
  });

  test('preserves every field already on the price point (does not drop close/date)', () => {
    const merged = mergeFairValueIntoPriceHistory(priceHistory, fairValueHistory);
    expect(merged[1]).toEqual({ date: '2023-12-31', close: 45, fairValue: 42 });
  });

  test('a day before the first known fair-value point gets null, not a fabricated backward guess', () => {
    const merged = mergeFairValueIntoPriceHistory(priceHistory, fairValueHistory);
    expect(merged[0].fairValue).toBeNull();
  });

  test('returns all-null fairValue when there is no fair-value history at all', () => {
    const merged = mergeFairValueIntoPriceHistory(priceHistory, []);
    merged.forEach((p) => expect(p.fairValue).toBeNull());
  });

  test('handles a missing/non-array priceHistory by returning an empty array', () => {
    expect(mergeFairValueIntoPriceHistory(null, fairValueHistory)).toEqual([]);
    expect(mergeFairValueIntoPriceHistory(undefined, fairValueHistory)).toEqual([]);
  });

  test('an out-of-order fairValueHistory is sorted before merging', () => {
    const reversed = [...fairValueHistory].reverse();
    const merged = mergeFairValueIntoPriceHistory(priceHistory, reversed);
    expect(merged.map((p) => p.fairValue)).toEqual([null, 42, 42, 50, 50]);
  });
});
