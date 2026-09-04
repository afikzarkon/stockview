// Comparison logic for two monthly portfolio checkpoints (see
// hooks/useMonthlySnapshots.js) - kept separate from the component so it's
// directly unit-testable, matching every other calculation in this app
// (utils/*.js, not inline in a component). Category keys/labels match
// analysis.exchangeDistribution's own shape (see snapshotBreakdown in
// App.js) - the same 6 categories used throughout PortfolioAnalysisView.js.
//
// Each category's breakdown value can be either the itemized shape (an
// array of { key, label, value } - one entry per actual holding/account,
// see utils/monthlySnapshotBreakdown.js) or, for snapshots saved before
// itemized breakdowns existed, a single flat number for the whole
// category. normalizeCategoryItems() treats both the same way so old and
// new snapshots compare correctly without a data migration.
//
// Contribution adjustment: a naive (compareValue/baseValue-1) % is
// distorted by any deposit/purchase/withdrawal/sale that happened partway
// through the period - it gets counted as investment growth (or loss) even
// though it's just money moving in or out. Fixed via Modified Dietz
// (utils/modifiedDietz.js), fed from two sources:
//
// 1. Auto-detected flows (buildLiveCashFlows) - for the categories that
//    have a real dated ledger (stock purchase lots, pension/bank-savings
//    deposits), drawn straight from the live portfolio, no user input
//    needed. This only ever sees money going IN (there's no sell/
//    withdrawal ledger anywhere in this app).
// 2. Manually-declared flows (buildManualCashFlows) - a user-entered net
//    amount per category, saved on the monthly snapshot itself as
//    breakdown.cashFlows (see PortfolioAnalysisView.js's save/edit/manual-
//    add forms). This is the *only* source for עו"ש/קרנות כספיות, which
//    have no ledger at all (just a single overwritten amount each time),
//    and the only way to capture a sale/withdrawal in any category, since
//    the auto-detected side can't see those.
//
// The two are additive per category - a period can both have an
// auto-detected purchase AND a manually-declared withdrawal.

import { calculateModifiedDietzReturn } from './modifiedDietz';

export const MONTHLY_CATEGORY_KEYS = ['israeli', 'american', 'pension', 'cashFunds', 'bank', 'bankSavings'];

// Categories with a real dated ledger (stock purchase lots, or a
// deposits: [{date,amount}] array) that lets us know exactly how much
// money entered and when - the only categories a Modified Dietz
// contribution-adjustment can be computed for.
export const CONTRIBUTION_ADJUSTABLE_CATEGORIES = ['israeli', 'american', 'pension', 'bankSavings'];

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

// Draws, for each contribution-adjustable category, a Map of item key
// (stock name / fund name - the same key used in the itemized breakdown)
// -> [{ date, amount }] cash flows, from the *live* portfolio state (not
// from anything stored in the snapshots, which never recorded a history of
// flows - only point-in-time values). This means the adjustment is only as
// good as the live data still being around: a deposit row the user has
// since deleted, or a fund/stock removed entirely, can no longer be netted
// out of an old comparison - a known, inherent limitation of not having a
// separate immutable transaction ledger.
export function buildLiveCashFlows(liveHoldings) {
  const flows = { israeli: new Map(), american: new Map(), pension: new Map(), bankSavings: new Map() };
  const push = (map, key, date, amount) => {
    if (!key || !date) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ date, amount });
  };

  (liveHoldings?.israeliStocks || []).forEach((s) => {
    push(flows.israeli, s.stockName, s.purchaseDate, (s.purchasePrice || 0) * (s.quantity || 0));
  });
  (liveHoldings?.americanStocks || []).forEach((s) => {
    // ILS cost at the time of purchase (purchase price * quantity * the
    // exchange rate paid) - matches totalPurchaseILS everywhere else in
    // this app, so it's on the same footing as the category's ILS values.
    push(flows.american, s.stockName, s.purchaseDate, (s.purchasePrice || 0) * (s.quantity || 0) * (s.exchangeRate || 0));
  });
  (liveHoldings?.pensionFunds || []).forEach((fund) => {
    (Array.isArray(fund.deposits) ? fund.deposits : []).forEach((d) => {
      push(flows.pension, fund.fundName, d.date, d.amount || 0);
    });
  });
  (liveHoldings?.bankSavingsFunds || []).forEach((fund) => {
    (Array.isArray(fund.deposits) ? fund.deposits : []).forEach((d) => {
      push(flows.bankSavings, fund.fundName, d.date, d.amount || 0);
    });
  });
  return flows;
}

// (periodStart, periodEnd] - a flow dated exactly on periodStart is
// treated as already reflected in the beginning value, not as "new" money
// during this period.
function flowsInPeriod(flowList, periodStart, periodEnd) {
  return (flowList || []).filter((f) => f.date && f.date > periodStart && f.date <= periodEnd);
}

// Last calendar day of a "YYYY-MM" month, as "YYYY-MM-DD" (day 0 of the
// following month = the last day of this one). Built via Date.UTC, not the
// local-time Date constructor - constructing in local time and then
// reading it back with toISOString() (which is always UTC) can silently
// shift the date by a day depending on the machine's timezone offset (e.g.
// local midnight Feb 29 in a UTC+2/+3 zone is Feb 28 in UTC) - confirmed
// this really happened during testing, not a theoretical concern.
function monthEndDateString(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0));
  return lastDay.toISOString().slice(0, 10);
}

// Draws user-declared net cash flows (positive = net deposited/bought,
// negative = net withdrawn/sold) from every saved month strictly after
// baseMonth and up to/including compareMonth - not just the two endpoints
// being compared, so a multi-month comparison (e.g. January vs. June)
// still picks up whatever was separately declared on March's, April's and
// May's own saves. Each snapshot's declared amount is dated to the last
// day of ITS OWN month for Modified Dietz weighting purposes - a
// reasonable stand-in for "sometime during the period this snapshot
// covers, by the time this snapshot was taken the money was already
// in/out." allSnapshots is the full list (any order/shape is fine, only
// .month and .breakdown.cashFlows are read).
export function buildManualCashFlows(allSnapshots, baseMonth, compareMonth) {
  const flows = MONTHLY_CATEGORY_KEYS.reduce((acc, key) => ({ ...acc, [key]: [] }), {});
  (allSnapshots || []).forEach((snap) => {
    if (!snap || typeof snap.month !== 'string') return;
    if (!(snap.month > baseMonth && snap.month <= compareMonth)) return;
    const cashFlows = snap.breakdown && typeof snap.breakdown === 'object' ? snap.breakdown.cashFlows : null;
    if (!cashFlows || typeof cashFlows !== 'object') return;
    MONTHLY_CATEGORY_KEYS.forEach((key) => {
      const amount = cashFlows[key];
      if (isFiniteNumber(amount) && amount !== 0) {
        flows[key].push({ date: monthEndDateString(snap.month), amount });
      }
    });
  });
  return flows;
}

// First calendar day of the month AFTER a "YYYY-MM" month, as "YYYY-MM-DD".
// Built via Date.UTC - see monthEndDateString's comment above for why.
function nextMonthStartDateString(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  // `month` is 1-indexed in the key; Date's month param is 0-indexed, so
  // passing it through unchanged lands on day 1 of the *next* month.
  const firstDayOfNextMonth = new Date(Date.UTC(year, month, 1));
  return firstDayOfNextMonth.toISOString().slice(0, 10);
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

// Applies a Modified Dietz contribution adjustment on top of a plain
// { baseValue, compareValue } pair, given the cash flows that fell inside
// this period for that specific item/category. Falls back to the naive
// percentChange whenever either side is missing (nothing changed there -
// an item that didn't exist yet isn't a "return" to adjust) or a period
// couldn't be determined (no periodStart/periodEnd, e.g. same-month
// comparison). With zero relevant cash flows, Modified Dietz reduces to
// exactly the same number as the naive calculation, so this is safe to
// apply unconditionally whenever a period+cash flows are available.
function adjustedChangePercent({ baseValue, compareValue, cashFlows, periodStart, periodEnd }) {
  const naive = percentChange(baseValue, compareValue);
  if (naive === null || !periodStart || !periodEnd || !cashFlows || cashFlows.length === 0) {
    return { changePercent: naive, rawChangePercent: naive, netCashFlow: 0, contributionAdjusted: false };
  }
  const { percent, netCashFlow } = calculateModifiedDietzReturn({
    beginningValue: baseValue,
    endingValue: compareValue,
    cashFlows,
    periodStart,
    periodEnd
  });
  return {
    changePercent: percent !== null ? percent : naive,
    rawChangePercent: naive,
    netCashFlow,
    contributionAdjusted: percent !== null
  };
}

// baseSnapshot/compareSnapshot: { month: 'YYYY-MM', totalValueILS, breakdown }
// (the shape useMonthlySnapshots' list returns). liveHoldings (optional):
// { israeliStocks, americanStocks, pensionFunds, bankSavingsFunds } - the
// *current* portfolio arrays, used to look up deposits/purchases that fell
// within the compared period so they can be netted out of the % change
// (see buildLiveCashFlows above). allSnapshots (optional): the full list of
// saved monthly snapshots (usually just `monthlySnapshots` as-is), used to
// pick up user-declared cash flows saved on any month in between (see
// buildManualCashFlows above) - needed for עו"ש/קרנות כספיות (no ledger at
// all) and for sales/withdrawals in any category (auto-detection only ever
// sees money going in). Omit both to get the old plain-percent behavior for
// every row. Returns one row per category plus a trailing "total" row. Each
// category row is { key, label, baseValue, compareValue, changePercent,
// rawChangePercent, netCashFlow, contributionAdjusted, items } where items
// is one row per actual holding/account (matched across the two snapshots
// by key, e.g. stock name) - items present in only one snapshot (bought/
// sold since) get null for the missing side rather than 0. A category with
// no items in a snapshot has baseValue/compareValue null for that side
// (never fabricated as 0), matching every other row. Manually-declared
// flows only ever apply at the category/total level (there's no per-item
// UI for them), so item rows only ever reflect auto-detected flows.
export function compareMonthlySnapshots(baseSnapshot, compareSnapshot, liveHoldings = null, allSnapshots = []) {
  if (!baseSnapshot || !compareSnapshot) return [];
  const baseBreakdown = baseSnapshot.breakdown || {};
  const compareBreakdown = compareSnapshot.breakdown || {};

  // Month-boundary approximation: monthly snapshots only record a "YYYY-MM"
  // month, not the exact day they were saved (and for manually-backfilled
  // past months, there is no real "saved on this day" moment at all - the
  // row is created whenever the user clicks add, regardless of which past
  // month it represents).
  //
  // periodStart is the 1st of the month AFTER the base month, not the base
  // month itself - anything dated within the base month is treated as
  // already reflected in baseValue. This matters: a flow dated anywhere in
  // the base month (even before the snapshot was actually saved) would
  // otherwise get netted out of the calculation a *second* time - once by
  // already being baked into baseValue, and again by being subtracted as
  // an "in-period" cash flow - which can swing the result to a wildly
  // wrong (even negative) percent for money that never left/entered mid-
  // period at all. periodEnd stays generous (the full last day of the
  // compare month) - the opposite failure mode (a flow dated after the
  // compare snapshot was actually saved, but still within that month,
  // getting netted out) only costs a little precision, never a wrong sign.
  // See modifiedDietz.js's own comment for why this is still an
  // approximation, not an exact daily return.
  const periodStart = nextMonthStartDateString(baseSnapshot.month);
  const periodEnd = monthEndDateString(compareSnapshot.month);
  const liveCashFlows = liveHoldings ? buildLiveCashFlows(liveHoldings) : null;
  const manualCashFlows = buildManualCashFlows(allSnapshots, baseSnapshot.month, compareSnapshot.month);

  // Per category: auto-detected flows (ledger categories only, drawn from
  // liveHoldings) + manually-declared flows (any category, drawn from
  // breakdown.cashFlows on the snapshots in between) - additive, since they
  // cover different things (auto sees deposits/purchases, manual is the
  // only way to record a sale/withdrawal, or anything at all for עו"ש/
  // קרנות כספיות).
  const categoryFlowsInPeriod = (key) => {
    const auto = liveCashFlows && CONTRIBUTION_ADJUSTABLE_CATEGORIES.includes(key)
      ? Array.from(liveCashFlows[key].values()).flatMap((list) => flowsInPeriod(list, periodStart, periodEnd))
      : [];
    const manual = flowsInPeriod(manualCashFlows[key], periodStart, periodEnd);
    return [...auto, ...manual];
  };

  const categoryRows = MONTHLY_CATEGORY_KEYS.map((key) => {
    const baseItems = normalizeCategoryItems(baseBreakdown[key], key);
    const compareItems = normalizeCategoryItems(compareBreakdown[key], key);
    const baseByKey = new Map(baseItems.map((it) => [it.key, it]));
    const compareByKey = new Map(compareItems.map((it) => [it.key, it]));
    const itemKeys = Array.from(new Set([...baseByKey.keys(), ...compareByKey.keys()]));
    // Manually-declared flows have no per-item breakdown - only the
    // auto-detected (ledger) side can be attributed to a specific item.
    const autoItemFlows = liveCashFlows && CONTRIBUTION_ADJUSTABLE_CATEGORIES.includes(key)
      ? liveCashFlows[key]
      : null;

    const items = itemKeys
      .map((itemKey) => {
        const baseItem = baseByKey.get(itemKey);
        const compareItem = compareByKey.get(itemKey);
        const baseValue = baseItem ? baseItem.value : null;
        const compareValue = compareItem ? compareItem.value : null;
        const cashFlows = autoItemFlows
          ? flowsInPeriod(autoItemFlows.get(itemKey), periodStart, periodEnd)
          : null;
        return {
          key: itemKey,
          label: (baseItem && baseItem.label) || (compareItem && compareItem.label) || itemKey,
          baseValue,
          compareValue,
          ...adjustedChangePercent({ baseValue, compareValue, cashFlows, periodStart, periodEnd })
        };
      })
      .sort((a, b) => (b.compareValue ?? b.baseValue ?? 0) - (a.compareValue ?? a.baseValue ?? 0));

    const baseHasCategory = baseItems.length > 0;
    const compareHasCategory = compareItems.length > 0;
    const baseTotal = baseItems.reduce((sum, it) => sum + it.value, 0);
    const compareTotal = compareItems.reduce((sum, it) => sum + it.value, 0);
    const categoryCashFlows = categoryFlowsInPeriod(key);

    return {
      key,
      label: MONTHLY_CATEGORY_LABELS_HE[key],
      baseValue: baseHasCategory ? baseTotal : null,
      compareValue: compareHasCategory ? compareTotal : null,
      ...adjustedChangePercent({
        baseValue: baseHasCategory ? baseTotal : null,
        compareValue: compareHasCategory ? compareTotal : null,
        cashFlows: categoryCashFlows.length > 0 ? categoryCashFlows : null,
        periodStart,
        periodEnd
      }),
      items
    };
  });

  const totalCashFlows = MONTHLY_CATEGORY_KEYS.flatMap((key) => categoryFlowsInPeriod(key));

  // "Partial" only when at least one category actually holding value has
  // no cash-flow data at all behind it (neither auto-detected nor
  // manually-declared) - i.e. there's a real, undisclosed gap in what the
  // total's adjustment could account for. Once the user has been
  // declaring flows for עו"ש/קרנות כספיות too, this naturally turns false.
  const partiallyAdjusted = MONTHLY_CATEGORY_KEYS.some((key) => {
    const hasLedger = CONTRIBUTION_ADJUSTABLE_CATEGORIES.includes(key);
    const hasManualData = manualCashFlows[key].length > 0;
    return !hasLedger && !hasManualData;
  });

  const totalRow = {
    key: 'total',
    label: 'סה"כ תיק',
    baseValue: isFiniteNumber(baseSnapshot.totalValueILS) ? baseSnapshot.totalValueILS : null,
    compareValue: isFiniteNumber(compareSnapshot.totalValueILS) ? compareSnapshot.totalValueILS : null,
    ...adjustedChangePercent({
      baseValue: isFiniteNumber(baseSnapshot.totalValueILS) ? baseSnapshot.totalValueILS : null,
      compareValue: isFiniteNumber(compareSnapshot.totalValueILS) ? compareSnapshot.totalValueILS : null,
      cashFlows: totalCashFlows.length > 0 ? totalCashFlows : null,
      periodStart,
      periodEnd
    }),
    partiallyAdjusted,
    items: []
  };

  return [...categoryRows, totalRow];
}
