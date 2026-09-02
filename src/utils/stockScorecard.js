// Turns raw stock fundamentals (server/stockResearchRoutes.js, plus the
// existing dividend data shape from dividendRoutes.js) into a
// SimplyWall.st-style scorecard: named checks grouped into categories,
// each pass/fail/null (null = not enough data - never faked as a
// midpoint, same principle as portfolioHealthScore.js), plus a
// transparent BUY/HOLD/SELL verdict formula. SimplyWall.st itself does
// NOT publish a buy/sell formula (only a checks-passed score) - the
// verdict below is this app's own rule, documented here, not a black box.
// It is a heuristic over public data, not investment advice.
//
// Past Performance (multi-year EPS/ROCE/ROA trends) uses fundamentalsHistory
// - a genuinely different Yahoo endpoint (fetchYahooFundamentalsTimeseries,
// what Yahoo's own site now uses for its Financials tab), not the legacy
// quoteSummary modules (balanceSheetHistory, incomeStatementHistory) that
// were verified during development to return empty statement shells
// (dates only, no actual line items) for real tickers. financialData's
// current-year ratios still drive Financial Health below - the two data
// sources cover different things (a snapshot vs. a trend).
//
// SimplyWall.st's Value checks compare P/E, P/B etc. against
// market-average and industry-average baselines - a database of
// thousands of stocks this app doesn't have. The checks below use fixed,
// documented rule-of-thumb thresholds instead - a deliberate
// simplification, not an attempt to replicate their exact numbers.
import { computeUpsidePercent } from './analystData';

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);

// null passed-state means "not enough data for this check", filtered out
// of both the checks-passed count and the category percentage - never
// silently treated as pass or fail.
const summarizeChecks = (checks) => {
  const applicable = checks.filter((c) => c.passed !== null);
  const passed = applicable.filter((c) => c.passed === true).length;
  return { checks, passed, total: applicable.length };
};

export const categoryPercent = (category) =>
  category && category.total > 0 ? (category.passed / category.total) * 100 : null;

// ---- Value ----
const VALUE_PE_MAX = 25; // rule-of-thumb ceiling, not a market-average comparison - see file header
const VALUE_PB_MAX = 3;

export const computeValueChecks = (research) => {
  const pe = research?.trailingPE;
  const peg = research?.pegRatio;
  const pb = research?.priceToBook;

  const checks = [
    {
      key: 'peReasonable',
      label: `מכפיל רווח (P/E) עד ${VALUE_PE_MAX}`,
      passed: isFiniteNumber(pe) ? pe > 0 && pe <= VALUE_PE_MAX : null,
      detail: isFiniteNumber(pe) ? pe.toFixed(1) : null
    },
    {
      key: 'pegAttractive',
      label: 'PEG בטווח 0-1 (צמיחה מתומחרת בזול)',
      passed: isFiniteNumber(peg) ? peg > 0 && peg <= 1 : null,
      detail: isFiniteNumber(peg) ? peg.toFixed(2) : null
    },
    {
      key: 'pbReasonable',
      label: `מכפיל הון (P/B) עד ${VALUE_PB_MAX}`,
      passed: isFiniteNumber(pb) ? pb > 0 && pb <= VALUE_PB_MAX : null,
      detail: isFiniteNumber(pb) ? pb.toFixed(2) : null
    }
  ];
  return summarizeChecks(checks);
};

// ---- Future Growth ----
export const computeFutureGrowthChecks = (research) => {
  const earningsGrowth = research?.earningsGrowth;
  const revenueGrowth = research?.revenueGrowth;
  const upside = computeUpsidePercent(research?.currentPrice, research?.targetMeanPrice);

  const checks = [
    {
      key: 'earningsGrowthPositive',
      label: 'צמיחת רווחים צפויה חיובית',
      passed: isFiniteNumber(earningsGrowth) ? earningsGrowth > 0 : null,
      detail: isFiniteNumber(earningsGrowth) ? `${(earningsGrowth * 100).toFixed(1)}%` : null
    },
    {
      key: 'revenueGrowthPositive',
      label: 'צמיחת הכנסות צפויה חיובית',
      passed: isFiniteNumber(revenueGrowth) ? revenueGrowth > 0 : null,
      detail: isFiniteNumber(revenueGrowth) ? `${(revenueGrowth * 100).toFixed(1)}%` : null
    },
    {
      key: 'highGrowth',
      label: 'צמיחת רווחים צפויה מעל 10%',
      passed: isFiniteNumber(earningsGrowth) ? earningsGrowth > 0.1 : null,
      detail: isFiniteNumber(earningsGrowth) ? `${(earningsGrowth * 100).toFixed(1)}%` : null
    },
    {
      key: 'analystUpside',
      label: 'יעד מחיר אנליסטים מעל המחיר הנוכחי',
      passed: upside !== null ? upside > 0 : null,
      detail: upside !== null ? `${upside.toFixed(1)}%` : null
    }
  ];
  return summarizeChecks(checks);
};

// ---- Financial Health ----
const HEALTH_CURRENT_RATIO_MIN = 1;
const HEALTH_DEBT_TO_EQUITY_MAX = 100; // Yahoo returns this on a 0-100+ percent scale (115.5 = 115.5%), not a 0-1 fraction

export const computeFinancialHealthChecks = (research) => {
  const currentRatio = research?.currentRatio;
  const debtToEquity = research?.debtToEquity;
  const roe = research?.returnOnEquity;
  const cashflowCoverage =
    isFiniteNumber(research?.operatingCashflow) && isFiniteNumber(research?.totalDebt) && research.totalDebt > 0
      ? (research.operatingCashflow / research.totalDebt) * 100
      : null;

  const checks = [
    {
      key: 'currentRatio',
      label: 'יחס שוטף מעל 1 (נכסים שוטפים מכסים התחייבויות שוטפות)',
      passed: isFiniteNumber(currentRatio) ? currentRatio > HEALTH_CURRENT_RATIO_MIN : null,
      detail: isFiniteNumber(currentRatio) ? currentRatio.toFixed(2) : null
    },
    {
      key: 'debtToEquity',
      label: `חוב להון עצמי מתחת ל-${HEALTH_DEBT_TO_EQUITY_MAX}%`,
      passed: isFiniteNumber(debtToEquity) ? debtToEquity < HEALTH_DEBT_TO_EQUITY_MAX : null,
      detail: isFiniteNumber(debtToEquity) ? `${debtToEquity.toFixed(1)}%` : null
    },
    {
      key: 'cashflowCoverage',
      label: 'תזרים תפעולי מכסה מעל 20% מהחוב',
      passed: cashflowCoverage !== null ? cashflowCoverage > 20 : null,
      detail: cashflowCoverage !== null ? `${cashflowCoverage.toFixed(1)}%` : null
    },
    {
      key: 'returnOnEquity',
      label: 'תשואה להון עצמי (ROE) מעל 15%',
      passed: isFiniteNumber(roe) ? roe > 0.15 : null,
      detail: isFiniteNumber(roe) ? `${(roe * 100).toFixed(1)}%` : null
    }
  ];
  return summarizeChecks(checks);
};

// ---- Past Performance ----
// Uses fundamentalsHistory (server/yahooQuotes.js's
// fetchYahooFundamentalsTimeseries) - real multi-year statement data,
// confirmed working during development, unlike quoteSummary's
// balanceSheetHistory/incomeStatementHistory. Adapted from SimplyWall.st's
// 6 checks: their "vs industry average" checks (EPS growth vs industry,
// ROA vs industry) are dropped - no industry-baseline database available,
// same reasoning as the Value category - and replaced with "vs own
// history" comparisons instead, which the row data actually supports.

// Matches consecutive {date, value}[] series by date (inner join) into a
// ratio series - e.g. EBIT/investedCapital per year for ROCE. Both series
// come from fetchYahooFundamentalsTimeseries, which already sorts each
// individually by date ascending.
const buildRatioSeries = (numerator, denominator) => {
  const byDateDenominator = new Map((denominator || []).map((d) => [d.date, d.value]));
  return (numerator || [])
    .filter((n) => byDateDenominator.has(n.date) && byDateDenominator.get(n.date) !== 0)
    .map((n) => ({ date: n.date, value: n.value / byDateDenominator.get(n.date) }));
};

// Growth check comparing the latest and earliest points of a series -
// null if there isn't at least 2 points to compare.
const growthCheck = (series, formatAsPercent) => {
  if (!series || series.length < 2) return null;
  const first = series[0];
  const last = series[series.length - 1];
  const format = (v) => (formatAsPercent ? `${(v * 100).toFixed(1)}%` : v.toFixed(2));
  return { passed: last.value > first.value, detail: `${format(first.value)} ← ${format(last.value)}` };
};

export const computePastPerformanceChecks = (fundamentalsHistory) => {
  const eps = fundamentalsHistory?.annualDilutedEPS;
  const roceSeries = buildRatioSeries(fundamentalsHistory?.annualEBIT, fundamentalsHistory?.annualInvestedCapital);
  const roaSeries = buildRatioSeries(fundamentalsHistory?.annualNetIncome, fundamentalsHistory?.annualTotalAssets);

  const epsGrowth = growthCheck(eps, false);

  // EPS growth acceleration: is the most recent year-over-year growth
  // faster than the average year-over-year growth across the whole
  // available history? Needs at least 3 points (2 YoY growth figures) to
  // compare "latest" against "average of at least 2".
  let epsAcceleration = null;
  if (eps && eps.length >= 3) {
    const yoyGrowths = [];
    for (let i = 1; i < eps.length; i++) {
      if (eps[i - 1].value !== 0) yoyGrowths.push((eps[i].value - eps[i - 1].value) / Math.abs(eps[i - 1].value));
    }
    if (yoyGrowths.length >= 2) {
      const latest = yoyGrowths[yoyGrowths.length - 1];
      const average = yoyGrowths.reduce((sum, g) => sum + g, 0) / yoyGrowths.length;
      epsAcceleration = {
        passed: latest > average,
        detail: `${(latest * 100).toFixed(1)}% מול ממוצע ${(average * 100).toFixed(1)}%`
      };
    }
  }

  const roceImprovement = growthCheck(roceSeries, true);
  const roaImprovement = growthCheck(roaSeries, true);

  const checks = [
    {
      key: 'epsGrowth',
      label: 'רווח למניה (EPS) גבוה יותר מתחילת התקופה הזמינה',
      passed: epsGrowth ? epsGrowth.passed : null,
      detail: epsGrowth ? epsGrowth.detail : null
    },
    {
      key: 'epsAcceleration',
      label: 'קצב צמיחת ה-EPS מואץ (השנה האחרונה מול הממוצע התקופתי)',
      passed: epsAcceleration ? epsAcceleration.passed : null,
      detail: epsAcceleration ? epsAcceleration.detail : null
    },
    {
      key: 'roceImprovement',
      label: 'תשואה על ההון המושקע (ROCE) השתפרה לעומת תחילת התקופה',
      passed: roceImprovement ? roceImprovement.passed : null,
      detail: roceImprovement ? roceImprovement.detail : null
    },
    {
      key: 'roaImprovement',
      label: 'תשואה על הנכסים (ROA) השתפרה לעומת תחילת התקופה',
      passed: roaImprovement ? roaImprovement.passed : null,
      detail: roaImprovement ? roaImprovement.detail : null
    }
  ];
  return summarizeChecks(checks);
};

// ---- Ownership ----
export const computeOwnershipChecks = (research) => {
  const insiderPct = research?.heldPercentInsiders;
  const institutionPct = research?.heldPercentInstitutions;
  const sales = research?.insiderRecentSales || 0;
  const purchases = research?.insiderRecentPurchases || 0;
  const hasInsiderSignal = sales + purchases > 0;

  const checks = [
    {
      key: 'insiderOwnership',
      label: 'בעלות פנימית (הנהלה/דירקטוריון) מעל 5%',
      passed: isFiniteNumber(insiderPct) ? insiderPct > 0.05 : null,
      detail: isFiniteNumber(insiderPct) ? `${(insiderPct * 100).toFixed(1)}%` : null
    },
    {
      key: 'institutionalOwnership',
      label: 'בעלות מוסדית מעל 30%',
      passed: isFiniteNumber(institutionPct) ? institutionPct > 0.3 : null,
      detail: isFiniteNumber(institutionPct) ? `${(institutionPct * 100).toFixed(1)}%` : null
    },
    {
      key: 'insiderNetBuying',
      label: 'פנימיים לא מוכרים יותר משהם קונים לאחרונה',
      passed: hasInsiderSignal ? purchases >= sales : null,
      detail: hasInsiderSignal ? `${purchases} קניות מול ${sales} מכירות` : null
    }
  ];
  return summarizeChecks(checks);
};

// ---- Dividend ----
// dividendData: the shape server/dividendRoutes.js already returns per
// symbol ({ dividendYieldPercent, payoutRatio, ... }) - reused as-is, not
// re-fetched or re-shaped.
export const computeDividendChecks = (dividendData) => {
  const yieldPercent = dividendData?.dividendYieldPercent;
  const payoutRatio = dividendData?.payoutRatio;
  const paysDividend = isFiniteNumber(yieldPercent) ? yieldPercent > 0 : null;

  const checks = [
    {
      key: 'paysDividend',
      label: 'המנייה משלמת דיבידנד',
      passed: paysDividend,
      detail: paysDividend ? `${yieldPercent.toFixed(2)}%` : null
    },
    {
      key: 'payoutSustainable',
      label: 'יחס חלוקה בטווח 0-90% (בר-קיימא)',
      passed: isFiniteNumber(payoutRatio) ? payoutRatio > 0 && payoutRatio < 0.9 : null,
      detail: isFiniteNumber(payoutRatio) ? `${(payoutRatio * 100).toFixed(0)}%` : null
    }
  ];
  return summarizeChecks(checks);
};

export const CATEGORY_LABELS_HE = {
  value: 'שווי הוגן',
  futureGrowth: 'צמיחה עתידית',
  pastPerformance: 'ביצועים היסטוריים',
  financialHealth: 'בריאות פיננסית',
  dividend: 'דיבידנד',
  ownership: 'בעלות'
};

export const VERDICT_LABELS_HE = { BUY: 'קנייה', HOLD: 'החזקה', SELL: 'מכירה' };

// This app's own rule (SimplyWall.st doesn't publish a buy/sell formula):
// - SELL if Financial Health is mostly failing (≤33%) - a solvency
//   problem overrides everything else looking fine.
// - SELL if the overall checks-passed rate is ≤35%.
// - BUY only if overall ≥65% AND Value ≥50% - a great company at a bad
//   price is a HOLD, not a BUY.
// - Everything else is HOLD.
// Returns verdict: null when there's no usable data at all, rather than
// defaulting to HOLD - "we don't know" and "we checked and it's
// middling" are different things.
export const computeStockVerdict = (categories) => {
  const included = Object.values(categories || {}).filter((c) => c && c.total > 0);
  if (included.length === 0) {
    return { verdict: null, overallPercent: null, totalPassed: 0, totalChecks: 0 };
  }

  const totalPassed = included.reduce((sum, c) => sum + c.passed, 0);
  const totalChecks = included.reduce((sum, c) => sum + c.total, 0);
  const overallPercent = (totalPassed / totalChecks) * 100;

  const valuePercent = categoryPercent(categories.value);
  const healthPercent = categoryPercent(categories.financialHealth);

  let verdict = 'HOLD';
  if (healthPercent !== null && healthPercent <= 33) {
    verdict = 'SELL';
  } else if (overallPercent <= 35) {
    verdict = 'SELL';
  } else if (overallPercent >= 65 && valuePercent !== null && valuePercent >= 50) {
    verdict = 'BUY';
  }

  return { verdict, overallPercent, totalPassed, totalChecks };
};

// research: fetchYahooStockResearch's shape (server/stockResearchRoutes.js),
// including its nested fundamentalsHistory field. dividendData:
// server/dividendRoutes.js's per-symbol shape, or null/undefined if not yet
// loaded - every check function tolerates missing input.
export const buildStockScorecard = (research, dividendData) => {
  const categories = {
    value: computeValueChecks(research),
    futureGrowth: computeFutureGrowthChecks(research),
    pastPerformance: computePastPerformanceChecks(research?.fundamentalsHistory),
    financialHealth: computeFinancialHealthChecks(research),
    dividend: computeDividendChecks(dividendData),
    ownership: computeOwnershipChecks(research)
  };

  return { categories, verdict: computeStockVerdict(categories) };
};
