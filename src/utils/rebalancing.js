// Rebalancing: the user defines a target allocation (% per portfolio
// category), and this compares it against the actual current allocation
// (from portfolioAnalysis.js's exchangeDistribution) to suggest how much
// to buy/sell in each category to get back to target.
//
// Deliberately scoped to the same 5 categories already shown in "פיזור
// לפי רכיבי תיק" (israeli/american/pension/cashFunds/bank), not individual
// stocks — a per-stock target would require the user to maintain a much
// larger set of numbers, and category-level is already the actionable
// granularity for most rebalancing decisions (e.g. "trim US exposure",
// not "trim exactly 3 shares of AAPL").

export const REBALANCE_CATEGORIES = ['israeli', 'american', 'pension', 'cashFunds', 'bank', 'bankSavings'];

export const CATEGORY_LABELS_HE = {
  israeli: 'בורסה ישראלית',
  american: 'בורסה אמריקאית',
  pension: 'קופות גמל',
  cashFunds: 'קרנות כספיות',
  bank: 'עו"ש',
  bankSavings: 'קופת חיסכון בבנק'
};

export const emptyTargets = () =>
  REBALANCE_CATEGORIES.reduce((acc, key) => ({ ...acc, [key]: 0 }), {});

export const sumTargetPercents = (targets) =>
  REBALANCE_CATEGORIES.reduce((sum, key) => sum + (Number(targets?.[key]) || 0), 0);

// Small tolerance for rounding (e.g. three categories at 33.34/33.33/33.33).
export const isValidTargetAllocation = (targets) => Math.abs(sumTargetPercents(targets) - 100) < 0.5;

// exchangeDistribution: analysis.exchangeDistribution from portfolioAnalysis.js
// targets: { israeli, american, pension, cashFunds, bank } as percentages
export const computeRebalancingPlan = (exchangeDistribution, targets) => {
  const totalValueILS = exchangeDistribution?.total || 0;

  const rows = REBALANCE_CATEGORIES.map((key) => {
    const currentValue = exchangeDistribution?.[key]?.value || 0;
    const currentPercent = exchangeDistribution?.[key]?.percentage || 0;
    const targetPercent = Number(targets?.[key]) || 0;
    const targetValue = (targetPercent / 100) * totalValueILS;
    return {
      key,
      label: CATEGORY_LABELS_HE[key],
      currentValue,
      currentPercent,
      targetPercent,
      targetValue,
      // Positive = underweight (buy this much more to reach target).
      // Negative = overweight (sell/trim this much).
      diffValue: targetValue - currentValue,
      diffPercent: targetPercent - currentPercent
    };
  });

  const maxAbsDiffPercent = rows.reduce((max, row) => Math.max(max, Math.abs(row.diffPercent)), 0);

  return {
    totalValueILS,
    rows,
    isValidAllocation: isValidTargetAllocation(targets),
    // A rough "how far off target is the whole portfolio" single number -
    // the single largest category deviation, so a 3% drift somewhere isn't
    // presented with the same urgency as a 25% one.
    maxAbsDiffPercent
  };
};
