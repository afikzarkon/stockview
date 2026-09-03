// Comparison logic for two monthly portfolio checkpoints (see
// hooks/useMonthlySnapshots.js) - kept separate from the component so it's
// directly unit-testable, matching every other calculation in this app
// (utils/*.js, not inline in a component). Category keys/labels match
// analysis.exchangeDistribution's own shape (see snapshotBreakdown in
// App.js) - the same 5 categories used throughout PortfolioAnalysisView.js.
//
// Each category's breakdown value can be either the itemized shape (an
// array of { key, label, value } - one entry per actual holding/account,
// see utils/monthlySnapshotBreakdown.js) or, for snapshots saved before
// itemized breakdowns existed, a single flat number for the whole
// category. normalizeCategoryItems() treats both the same way so old and
// new snapshots compare correctly without a data migration.

export const MONTHLY_CATEGORY_KEYS = ['israeli', 'american', 'pension', 'cashFunds', 'bank', 'bankSavings'];

export const MONTHLY_CATEGORY_LABELS_HE = {
  israeli: 'בורסה ישראלית',
  american: 'בורסה אמריקאית',
  pension: 'קופות גמל',
  cashFunds: 'קרנות כספיות',
  bank: 'עו"ש',
  bankSavings: 'קופת חיסכון בבנק'
};

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);

// null (not 0 or Infinity) when there's nothing meaningful to divide by -
// same "don't fake a number" principle used throughout this app's other
// scoring/analysis utils.
function percentChange(base, compare) {
  if (!isFiniteNumber(base) || !isFiniteNumber(compare) || base === 0) return null;
  return ((compare - base) / Math.abs(base)) * 100;
}

// Always returns an array of { key, label, value }, regardless of which of
// the two saved shapes this category used.
export function normalizeCategoryItems(categoryValue, categoryKey) {
  if (Array.isArray(categoryValue)) {
    return categoryValue.filter((it) => it && typeof it === 'object' && isFiniteNumber(it.value));
  }
  if (isFiniteNumber(categoryValue)) {
    return [{ key: categoryKey, label: MONTHLY_CATEGORY_LABELS_HE[categoryKey], value: categoryValue }];
  }
  return [];
}

// True when a category's "items" is really just normalizeCategoryItems()'s
// synthetic stand-in for a legacy flat-number save (before itemized
// breakdowns existed) - i.e. there's no real per-stock/per-fund detail to
// show, just the category's own old total wearing an item's shape. Lets
// the UI show an honest "no detail available" note instead of a confusing
// item row that just repeats the category name/value.
export function isLegacyRollup(items, categoryKey) {
  return items.length === 1 && items[0].key === categoryKey && items[0].label === MONTHLY_CATEGORY_LABELS_HE[categoryKey];
}

// baseSnapshot/compareSnapshot: { month: 'YYYY-MM', totalValueILS, breakdown }
// (the shape useMonthlySnapshots' list returns). Returns one row per
// category plus a trailing "total" row. Each category row is
// { key, label, baseValue, compareValue, changePercent, items } where
// items is one row per actual holding/account (matched across the two
// snapshots by key, e.g. stock name) - items present in only one snapshot
// (bought/sold since) get null for the missing side rather than 0. A
// category with no items in a snapshot has baseValue/compareValue null for
// that side (never fabricated as 0), matching every other row.
export function compareMonthlySnapshots(baseSnapshot, compareSnapshot) {
  if (!baseSnapshot || !compareSnapshot) return [];
  const baseBreakdown = baseSnapshot.breakdown || {};
  const compareBreakdown = compareSnapshot.breakdown || {};

  const categoryRows = MONTHLY_CATEGORY_KEYS.map((key) => {
    const baseItems = normalizeCategoryItems(baseBreakdown[key], key);
    const compareItems = normalizeCategoryItems(compareBreakdown[key], key);
    const baseByKey = new Map(baseItems.map((it) => [it.key, it]));
    const compareByKey = new Map(compareItems.map((it) => [it.key, it]));
    const itemKeys = Array.from(new Set([...baseByKey.keys(), ...compareByKey.keys()]));

    const items = itemKeys
      .map((itemKey) => {
        const baseItem = baseByKey.get(itemKey);
        const compareItem = compareByKey.get(itemKey);
        const baseValue = baseItem ? baseItem.value : null;
        const compareValue = compareItem ? compareItem.value : null;
        return {
          key: itemKey,
          label: (baseItem && baseItem.label) || (compareItem && compareItem.label) || itemKey,
          baseValue,
          compareValue,
          changePercent: percentChange(baseValue, compareValue)
        };
      })
      .sort((a, b) => (b.compareValue ?? b.baseValue ?? 0) - (a.compareValue ?? a.baseValue ?? 0));

    const baseHasCategory = baseItems.length > 0;
    const compareHasCategory = compareItems.length > 0;
    const baseTotal = baseItems.reduce((sum, it) => sum + it.value, 0);
    const compareTotal = compareItems.reduce((sum, it) => sum + it.value, 0);

    return {
      key,
      label: MONTHLY_CATEGORY_LABELS_HE[key],
      baseValue: baseHasCategory ? baseTotal : null,
      compareValue: compareHasCategory ? compareTotal : null,
      changePercent: percentChange(baseHasCategory ? baseTotal : null, compareHasCategory ? compareTotal : null),
      items
    };
  });

  const totalRow = {
    key: 'total',
    label: 'סה"כ תיק',
    baseValue: isFiniteNumber(baseSnapshot.totalValueILS) ? baseSnapshot.totalValueILS : null,
    compareValue: isFiniteNumber(compareSnapshot.totalValueILS) ? compareSnapshot.totalValueILS : null,
    changePercent: percentChange(baseSnapshot.totalValueILS, compareSnapshot.totalValueILS),
    items: []
  };

  return [...categoryRows, totalRow];
}
