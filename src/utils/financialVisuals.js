// Pure builder functions turning fundamentalsHistory (see
// fetchYahooFundamentalsTimeseries in server/yahooQuotes.js) and priceHistory
// into the shapes the "phase 2" charts in StockResearchView.js need (revenue
// breakdown donut, revenue/net-income trend bar, balance-sheet treemap,
// ROCE, historical P/E). No fetching here, no formatting decisions beyond
// what a chart needs - every function returns null/[] (never a fabricated
// placeholder) when its required fields are missing, same principle as
// stockScorecard.js's checks.

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);

function latestValue(series) {
  return Array.isArray(series) && series.length > 0 ? series[series.length - 1].value : null;
}

const DEFAULT_MAX_DATE_DIFF_MS = 30 * 24 * 60 * 60 * 1000; // ~30 days

// Finds the priceHistory point ({date, close}) whose date is closest to
// dateStr, within maxDiffMs (a match further away than that is considered
// no match at all, rather than a misleadingly stale one). Shared by
// buildHistoricalPeSeries below and by the Price History chart's dividend
// markers in StockResearchView.js (a dividend ex-date rarely lands exactly
// on a trading day already present in priceHistory).
export function findNearestPricePoint(priceHistory, dateStr, maxDiffMs = DEFAULT_MAX_DATE_DIFF_MS) {
  if (!Array.isArray(priceHistory) || priceHistory.length === 0 || !dateStr) return null;
  const targetTime = new Date(dateStr).getTime();
  if (!Number.isFinite(targetTime)) return null;

  let closest = null;
  let closestDiff = Infinity;
  priceHistory.forEach((point) => {
    const pointTime = new Date(point.date).getTime();
    if (!Number.isFinite(pointTime)) return;
    const diff = Math.abs(pointTime - targetTime);
    if (diff < closestDiff) {
      closestDiff = diff;
      closest = point;
    }
  });
  return closest && closestDiff <= maxDiffMs ? closest : null;
}

// Latest-year revenue composition: COGS, operating expense, interest
// expense, tax, and net income as slices of total revenue, plus a residual
// "Other" slice only when the remainder is meaningfully positive (Yahoo's
// line items don't always sum exactly to revenue - rounding/reclassified
// items - so a tiny residual is dropped rather than shown as a slice).
export function buildRevenueBreakdown(fundamentalsHistory) {
  const revenue = latestValue(fundamentalsHistory?.annualTotalRevenue);
  if (!isFiniteNumber(revenue) || revenue <= 0) return null;

  const cogs = latestValue(fundamentalsHistory?.annualCostOfRevenue) || 0;
  const opEx = latestValue(fundamentalsHistory?.annualOperatingExpense) || 0;
  const interest = latestValue(fundamentalsHistory?.annualInterestExpense) || 0;
  const tax = latestValue(fundamentalsHistory?.annualTaxProvision) || 0;
  const netIncome = latestValue(fundamentalsHistory?.annualNetIncome) || 0;

  const slices = [
    { key: 'cogs', label: 'עלות המכירות', value: Math.abs(cogs) },
    { key: 'opEx', label: 'הוצאות תפעוליות', value: Math.abs(opEx) },
    { key: 'interest', label: 'הוצאות ריבית', value: Math.abs(interest) },
    { key: 'tax', label: 'מיסים', value: Math.abs(tax) },
    { key: 'netIncome', label: 'רווח נקי', value: Math.abs(netIncome) }
  ].filter((s) => s.value > 0);

  const accountedFor = slices.reduce((sum, s) => sum + s.value, 0);
  const residual = revenue - accountedFor;
  if (residual > revenue * 0.02) {
    slices.push({ key: 'other', label: 'אחר', value: residual });
  }

  return slices.length > 0 ? { revenue, slices } : null;
}

// Revenue + net income per fiscal year, for a trend bar chart.
export function buildRevenueTrend(fundamentalsHistory) {
  const revenueSeries = fundamentalsHistory?.annualTotalRevenue;
  if (!Array.isArray(revenueSeries) || revenueSeries.length === 0) return null;

  const netIncomeByDate = new Map((fundamentalsHistory?.annualNetIncome || []).map((p) => [p.date, p.value]));
  return revenueSeries.map((p) => ({
    year: p.date ? p.date.slice(0, 4) : '',
    revenue: p.value,
    netIncome: netIncomeByDate.has(p.date) ? netIncomeByDate.get(p.date) : null
  }));
}

// Latest-year balance sheet, split into an Assets group and a Liabilities &
// Equity group - the shape recharts' Treemap expects (nested {name,
// children}).
export function buildBalanceSheetTreemap(fundamentalsHistory) {
  const currentAssets = latestValue(fundamentalsHistory?.annualCurrentAssets);
  const netPPE = latestValue(fundamentalsHistory?.annualNetPPE);
  const goodwill = latestValue(fundamentalsHistory?.annualGoodwillAndOtherIntangibleAssets);
  const cash = latestValue(fundamentalsHistory?.annualCashAndCashEquivalents);
  const currentLiabilities = latestValue(fundamentalsHistory?.annualCurrentLiabilities);
  const longTermDebt = latestValue(fundamentalsHistory?.annualLongTermDebt);
  const stockholdersEquity = latestValue(fundamentalsHistory?.annualStockholdersEquity);

  const assetsChildren = [
    { name: 'נכסים שוטפים', size: currentAssets },
    { name: 'רכוש קבוע', size: netPPE },
    { name: 'מוניטין ונכסים בלתי מוחשיים', size: goodwill },
    { name: 'מזומן ושווי מזומן', size: cash }
  ].filter((c) => isFiniteNumber(c.size) && c.size > 0);

  const liabilitiesChildren = [
    { name: 'התחייבויות שוטפות', size: currentLiabilities },
    { name: 'חוב לזמן ארוך', size: longTermDebt },
    { name: 'הון עצמי', size: stockholdersEquity }
  ].filter((c) => isFiniteNumber(c.size) && c.size > 0);

  if (assetsChildren.length === 0 && liabilitiesChildren.length === 0) return null;

  const groups = [];
  if (assetsChildren.length > 0) groups.push({ name: 'נכסים', children: assetsChildren });
  if (liabilitiesChildren.length > 0) groups.push({ name: 'התחייבויות והון', children: liabilitiesChildren });
  return groups;
}

// Latest-year ROCE (EBIT / invested capital) - ROE/ROA already come
// straight from research.returnOnEquity/returnOnAssets (current-year
// pre-computed ratios from financialData), so only ROCE needs deriving here.
export function computeLatestRoce(fundamentalsHistory) {
  const ebit = latestValue(fundamentalsHistory?.annualEBIT);
  const investedCapital = latestValue(fundamentalsHistory?.annualInvestedCapital);
  if (!isFiniteNumber(ebit) || !isFiniteNumber(investedCapital) || investedCapital === 0) return null;
  return ebit / investedCapital;
}

// Approximate historical P/E: for each year's actually-reported diluted EPS,
// find the closest trading-day close in priceHistory and divide. This is a
// real, labeled approximation (year-end price over that year's real
// reported EPS) - not Yahoo's own historical P/E series, which isn't
// available via this API.
export function buildHistoricalPeSeries(epsSeries, priceHistory) {
  if (!Array.isArray(epsSeries) || epsSeries.length === 0) return null;
  if (!Array.isArray(priceHistory) || priceHistory.length === 0) return null;

  const points = epsSeries
    .map((epsPoint) => {
      if (!isFiniteNumber(epsPoint.value) || epsPoint.value <= 0 || !epsPoint.date) return null;
      // Don't match a price more than ~30 days away from the fiscal
      // year-end - a distant match would be misleading, not just imprecise.
      const closest = findNearestPricePoint(priceHistory, epsPoint.date);
      if (!closest) return null;
      return { year: epsPoint.date.slice(0, 4), pe: closest.close / epsPoint.value };
    })
    .filter(Boolean);

  return points.length > 0 ? points : null;
}
