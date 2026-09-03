// A simplified, fully-documented 2-stage discounted-cash-flow (DCF) fair
// value estimate - StockView's own model, not a reproduction of
// SimplyWall.st's (they don't publish theirs either). Same transparency
// stance as the BUY/HOLD/SELL verdict in stockScorecard.js: every
// assumption below is a fixed, documented number, not fetched "as if" it
// were precise, and the function returns null (never a fabricated fair
// value) whenever an input it actually needs is missing or the model's
// math would break down.
//
// Method: grow the latest reported free cash flow for 5 years at a growth
// rate derived from analyst estimates, discount those 5 years plus a
// Gordon-growth terminal value back to the present at a CAPM cost of
// equity, then divide by shares outstanding for a per-share fair value.
// This is a real, standard equity-valuation technique - the
// simplification vs. a "real" analyst DCF is in the fixed macro
// assumptions (risk-free rate, equity risk premium, terminal growth)
// below, not in the formula itself.
//
// A real limitation worth naming, not hiding: basing 5 years of
// projection on a single reported year's FCF badly misrepresents a
// business whose cash flow is genuinely cyclical/volatile - e.g. a
// semiconductor name recovering from a trough, where the latest fiscal
// year's FCF is a fraction of what the business is already earning
// mid-recovery. A real analyst model (this is what SimplyWall.st's own
// number is built from, not this app's) uses multi-year *forward*
// consensus FCF/earnings forecasts to capture that; this app only has a
// single "next year growth %" estimate to work with, which can't. Rather
// than pretend this app's simplified number and a real analyst forecast
// should agree, computeDcfFairValue flags the case explicitly
// (isLowConfidence) so the UI can say so instead of presenting a
// confidently wrong-looking number - see hasVolatileFcfHistory below.

const RISK_FREE_RATE = 0.04; // ~long-run US 10y treasury ballpark, not live-fetched
const EQUITY_RISK_PREMIUM = 0.055; // common long-run US equity risk premium estimate
const TERMINAL_GROWTH_RATE = 0.025; // ~long-run nominal GDP growth ballpark
const PROJECTION_YEARS = 5;
const GROWTH_RATE_MIN = -0.2;
const GROWTH_RATE_MAX = 0.3;

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// marketCap / currentPrice is always internally consistent with
// currentPrice's own currency and scale - market cap is *defined* as price
// times shares, from the same live quote. The separately-reported
// defaultKeyStatistics.sharesOutstanding can lag a recent stock split or
// reflect a different share class/reporting date than the live price;
// dividing by it then produces a fair value wildly out of step with
// currentPrice (a real observed case: a stale share count made a fair
// value come out ~30x too low, showing as an absurd "-3110% overvalued").
// Preferred whenever available; falls back to the reported figure only
// when marketCap is missing.
function resolveSharesOutstanding(research) {
  const currentPrice = research?.currentPrice;
  const impliedShares =
    isFiniteNumber(research?.marketCap) && isFiniteNumber(currentPrice) && currentPrice > 0
      ? research.marketCap / currentPrice
      : null;
  return impliedShares ?? research?.sharesOutstanding;
}

// Core formula, shared by computeDcfFairValue (today's fair value, from the
// latest reported FCF) and computeDcfFairValueHistory (what the fair value
// would have been at each past reported FCF, holding today's beta/growth/
// shares fixed - see that function's own comment). Returns a per-share
// value or null, never a fabricated number when the math breaks down.
function computeFairValuePerShare(fcf, discountRate, growthRate, sharesOutstanding) {
  if (!isFiniteNumber(fcf) || fcf <= 0) return null;
  if (!isFiniteNumber(sharesOutstanding) || sharesOutstanding <= 0) return null;
  if (discountRate <= TERMINAL_GROWTH_RATE) return null;

  let presentValueSum = 0;
  let fcfYearN = fcf;
  for (let year = 1; year <= PROJECTION_YEARS; year++) {
    fcfYearN *= 1 + growthRate;
    presentValueSum += fcfYearN / Math.pow(1 + discountRate, year);
  }

  const terminalValue = (fcfYearN * (1 + TERMINAL_GROWTH_RATE)) / (discountRate - TERMINAL_GROWTH_RATE);
  const presentValueOfTerminal = terminalValue / Math.pow(1 + discountRate, PROJECTION_YEARS);

  const equityValue = presentValueSum + presentValueOfTerminal;
  const fairValuePerShare = equityValue / sharesOutstanding;
  return isFiniteNumber(fairValuePerShare) && fairValuePerShare > 0 ? fairValuePerShare : null;
}

// True when the reported FCF history includes a negative-or-zero year -
// a concrete, objective sign that the business's cash flow has been
// unstable/cyclical recently (a real observed case: Micron's FCF swung
// from +$3.1B to -$6.1B to +$0.12B to +$1.7B across 4 fiscal years).
// Basing 5 years of projection on a single such year - even the latest
// one - is far less reliable than for a steady business; surfaced to the
// UI as an explicit caveat rather than silently trusted (see
// computeDcfFairValue's isLowConfidence).
function hasVolatileFcfHistory(fcfSeries) {
  return Array.isArray(fcfSeries) && fcfSeries.some((p) => isFiniteNumber(p?.value) && p.value <= 0);
}

// research: the same object stockScorecard.js consumes (fetchYahooStockResearch's
// return shape) - needs beta, sharesOutstanding, currentPrice, and either
// nextYearEarningsGrowth or earningsGrowth for the stage-1 growth rate.
// fundamentalsHistory: research.fundamentalsHistory, for the latest reported
// annualFreeCashFlow.
export function computeDcfFairValue(research, fundamentalsHistory) {
  const beta = research?.beta;
  const currentPrice = research?.currentPrice;
  const fcfSeries = fundamentalsHistory?.annualFreeCashFlow;
  const latestFcf = Array.isArray(fcfSeries) && fcfSeries.length > 0 ? fcfSeries[fcfSeries.length - 1].value : null;
  const sharesOutstanding = resolveSharesOutstanding(research);

  if (!isFiniteNumber(beta) || !isFiniteNumber(sharesOutstanding) || sharesOutstanding <= 0) return null;
  if (!isFiniteNumber(latestFcf) || latestFcf <= 0) return null;

  const discountRate = RISK_FREE_RATE + beta * EQUITY_RISK_PREMIUM;
  // Gordon growth blows up (or goes negative) once the discount rate no
  // longer exceeds the terminal growth rate - a real edge case for very
  // low-beta names under this fixed equity risk premium. Rather than
  // return a nonsensical number, the model just doesn't apply here.
  if (discountRate <= TERMINAL_GROWTH_RATE) return null;

  const rawGrowth = research?.nextYearEarningsGrowth ?? research?.earningsGrowth;
  const growthRate = isFiniteNumber(rawGrowth) ? clamp(rawGrowth, GROWTH_RATE_MIN, GROWTH_RATE_MAX) : 0;

  const fairValuePerShare = computeFairValuePerShare(latestFcf, discountRate, growthRate, sharesOutstanding);
  if (fairValuePerShare === null) return null;

  const marginOfSafetyPercent = isFiniteNumber(currentPrice)
    ? ((fairValuePerShare - currentPrice) / fairValuePerShare) * 100
    : null;

  return {
    fairValuePerShare,
    currentPrice: isFiniteNumber(currentPrice) ? currentPrice : null,
    marginOfSafetyPercent,
    isLowConfidence: hasVolatileFcfHistory(fcfSeries),
    assumptions: {
      riskFreeRate: RISK_FREE_RATE,
      equityRiskPremium: EQUITY_RISK_PREMIUM,
      terminalGrowthRate: TERMINAL_GROWTH_RATE,
      discountRate,
      growthRate,
      projectionYears: PROJECTION_YEARS
    }
  };
}

// A per-year "what would the fair value have been" series, for the Future
// Cash Flow Value chart (StockResearchView.js) - reuses the exact same
// formula and TODAY's beta/growth-rate/shares (we don't have historical
// values for those), just swapping in each past year's own *reported* free
// cash flow. This is a real, if simplified, sensitivity view - each point
// comes from an actually-reported FCF figure, not an invented trend - and
// is deliberately NOT the same claim as "the market's fair value estimate
// on that date" (which would need historical beta/growth/shares data this
// app doesn't have). Returns [] when there's nothing to compute from
// (never a fabricated series).
export function computeDcfFairValueHistory(research, fundamentalsHistory) {
  const beta = research?.beta;
  const fcfSeries = fundamentalsHistory?.annualFreeCashFlow;
  const sharesOutstanding = resolveSharesOutstanding(research);

  if (!isFiniteNumber(beta) || !isFiniteNumber(sharesOutstanding) || sharesOutstanding <= 0) return [];
  if (!Array.isArray(fcfSeries) || fcfSeries.length === 0) return [];

  const discountRate = RISK_FREE_RATE + beta * EQUITY_RISK_PREMIUM;
  if (discountRate <= TERMINAL_GROWTH_RATE) return [];

  const rawGrowth = research?.nextYearEarningsGrowth ?? research?.earningsGrowth;
  const growthRate = isFiniteNumber(rawGrowth) ? clamp(rawGrowth, GROWTH_RATE_MIN, GROWTH_RATE_MAX) : 0;

  return fcfSeries
    .map((point) => ({
      date: point.date,
      fairValuePerShare: computeFairValuePerShare(point.value, discountRate, growthRate, sharesOutstanding)
    }))
    .filter((point) => point.date && point.fairValuePerShare !== null);
}

// Carries each fairValueHistory point forward onto the (much denser, daily)
// priceHistory series - "as of this day, our latest-available FCF-derived
// fair value estimate was X" - so the Future Cash Flow Value chart
// (StockResearchView.js) can plot both lines against the same daily x-axis
// without a fragile exact-date string match between an annual series and a
// daily one. A day before the first known fair-value point gets null (not
// a fabricated backward guess); priceHistory must already be sorted
// ascending by date (as fetchYahooHistoricalCloses returns it).
export function mergeFairValueIntoPriceHistory(priceHistory, fairValueHistory) {
  if (!Array.isArray(priceHistory)) return [];
  const sortedFairValues = Array.isArray(fairValueHistory)
    ? [...fairValueHistory].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    : [];

  let cursor = 0;
  let carried = null;
  return priceHistory.map((point) => {
    while (cursor < sortedFairValues.length && sortedFairValues[cursor].date <= point.date) {
      carried = sortedFairValues[cursor].fairValuePerShare;
      cursor += 1;
    }
    return { ...point, fairValue: carried };
  });
}
