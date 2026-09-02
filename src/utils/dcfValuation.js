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

const RISK_FREE_RATE = 0.04; // ~long-run US 10y treasury ballpark, not live-fetched
const EQUITY_RISK_PREMIUM = 0.055; // common long-run US equity risk premium estimate
const TERMINAL_GROWTH_RATE = 0.025; // ~long-run nominal GDP growth ballpark
const PROJECTION_YEARS = 5;
const GROWTH_RATE_MIN = -0.2;
const GROWTH_RATE_MAX = 0.3;

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// research: the same object stockScorecard.js consumes (fetchYahooStockResearch's
// return shape) - needs beta, sharesOutstanding, currentPrice, and either
// nextYearEarningsGrowth or earningsGrowth for the stage-1 growth rate.
// fundamentalsHistory: research.fundamentalsHistory, for the latest reported
// annualFreeCashFlow.
export function computeDcfFairValue(research, fundamentalsHistory) {
  const beta = research?.beta;
  const sharesOutstanding = research?.sharesOutstanding;
  const currentPrice = research?.currentPrice;
  const fcfSeries = fundamentalsHistory?.annualFreeCashFlow;
  const latestFcf = Array.isArray(fcfSeries) && fcfSeries.length > 0 ? fcfSeries[fcfSeries.length - 1].value : null;

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

  let presentValueSum = 0;
  let fcfYearN = latestFcf;
  for (let year = 1; year <= PROJECTION_YEARS; year++) {
    fcfYearN *= 1 + growthRate;
    presentValueSum += fcfYearN / Math.pow(1 + discountRate, year);
  }

  const terminalValue = (fcfYearN * (1 + TERMINAL_GROWTH_RATE)) / (discountRate - TERMINAL_GROWTH_RATE);
  const presentValueOfTerminal = terminalValue / Math.pow(1 + discountRate, PROJECTION_YEARS);

  const equityValue = presentValueSum + presentValueOfTerminal;
  const fairValuePerShare = equityValue / sharesOutstanding;
  if (!isFiniteNumber(fairValuePerShare) || fairValuePerShare <= 0) return null;

  const marginOfSafetyPercent = isFiniteNumber(currentPrice)
    ? ((fairValuePerShare - currentPrice) / fairValuePerShare) * 100
    : null;

  return {
    fairValuePerShare,
    currentPrice: isFiniteNumber(currentPrice) ? currentPrice : null,
    marginOfSafetyPercent,
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
