// Historical portfolio performance: the equity curve, the return since
// inception, and annualized volatility.
//
// WHERE THE NUMBERS COME FROM (this changed)
// ------------------------------------------
// These used to be computed from saved daily value snapshots - rows the app
// wrote whenever the user happened to open it. That made every figure here
// a function of *usage*, not of the market: a user who opened the app twice
// in March and once in July got a three-point "performance over time", and
// "return since inception" measured from whenever they first logged in
// rather than from when they actually started investing.
//
// Performance is now computed on the fly from real historical closing
// prices (TASE + Yahoo, plus the USD/ILS history for the American side -
// see utils/historicalPortfolioValue.js and server/historicalPricesRoutes.js),
// valuing the holdings the portfolio actually contained on each date. So:
//
//   * the curve starts at the earliest purchase date in the portfolio, not
//     at the first snapshot;
//   * it has a point for every sampled date in that whole span, whether or
//     not the app was open that day;
//   * nothing has to be saved in advance for it to work, and correcting a
//     purchase date or quantity corrects the whole history immediately.
//
// buildEquitySeries below still normalizes the saved-snapshot shape, since
// snapshots remain the source for the monthly checkpoint comparison; it's
// just no longer where performance comes from.

import { calculateModifiedDietzReturn } from './modifiedDietz';
import { cashFlowsInPeriod } from './portfolioCashFlows';

// Normalizes raw snapshot rows (as returned by GET /api/portfolio-snapshots)
// into a clean, sorted {date, value}[] series.
export const buildEquitySeries = (snapshots) => {
  if (!Array.isArray(snapshots)) return [];
  return snapshots
    .filter((s) => s && s.date && Number.isFinite(Number(s.totalValueILS)))
    .map((s) => ({ date: s.date, value: Number(s.totalValueILS) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
};

// Normalizes the dynamic historical-value series (utils/historicalPortfolioValue.js
// returns {date, valueILS, isPartial}) into the same {date, value}[] shape,
// dropping dates the portfolio couldn't be valued on at all.
export const buildSeriesFromHistoricalValues = (historicalSeries) => {
  if (!Array.isArray(historicalSeries)) return [];
  return historicalSeries
    .filter((p) => p && p.date && Number.isFinite(p.valueILS) && p.valueILS > 0)
    .map((p) => ({ date: p.date, value: p.valueILS }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const daysBetween = (d1, d2) => {
  const a = new Date(d1);
  const b = new Date(d2);
  const days = (b - a) / MS_PER_DAY;
  return days > 0 ? days : 0.5; // guard against same-day duplicates / clock skew
};

// Returns between consecutive points, each tagged with the number of
// calendar days that elapsed.
export const computePeriodReturns = (series) => {
  const returns = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const curr = series[i];
    if (prev.value > 0) {
      returns.push({
        date: curr.date,
        periodReturn: curr.value / prev.value - 1,
        days: daysBetween(prev.date, curr.date)
      });
    }
  }
  return returns;
};

// Converts each period return to a "daily-equivalent" return
// ((1+r)^(1/days) - 1) so unevenly-spaced points can be compared on the
// same footing, then returns their mean/stdev (sample stdev, n-1).
const dailyEquivalentStats = (returns) => {
  const dailyEquivalents = returns.map((r) => Math.pow(1 + r.periodReturn, 1 / r.days) - 1);
  const mean = dailyEquivalents.reduce((s, v) => s + v, 0) / dailyEquivalents.length;
  const variance =
    dailyEquivalents.reduce((s, v) => s + Math.pow(v - mean, 2), 0) /
    Math.max(dailyEquivalents.length - 1, 1);
  return { mean, stdev: Math.sqrt(variance) };
};

// Trading days per calendar year - the standard convention, and the right
// figure to annualize a DAILY-equivalent standard deviation by.
export const TRADING_DAYS_PER_YEAR = 252;

// Annualized volatility (%): the annualized standard deviation of the
// portfolio's returns.
//
// AUDIT NOTE. The method is: convert each period's return to its
// daily-equivalent (above), take the sample standard deviation of those,
// and scale by sqrt(252) to annualize. That is textbook-correct *provided
// the inputs are real price-driven returns sampled on a consistent basis* -
// and that proviso is exactly what was wrong before.
//
// The old inputs were saved app-open snapshots: irregular (a 1-day gap next
// to a 40-day gap), sparse, and clustered around whenever the user happened
// to visit. Compounding a 40-day return down to a daily-equivalent
// *smooths away* the volatility that actually occurred inside it, so the
// resulting number was systematically understated, and unstable from one
// user session to the next for reasons that had nothing to do with the
// market.
//
// Fed from the dynamic historical-close series instead, the sampling is
// regular and market-driven, which is what makes sqrt(252) the correct
// scaling rather than an approximation layered on an approximation. The
// residual smoothing from sampling weekly rather than daily is real and
// unavoidable (it's what bounds the number of lookups a multi-year chart
// does), which is why the figure stays labelled an estimate.
export const computeVolatilityPercent = (returns) => {
  if (returns.length < 2) return null;
  const { stdev } = dailyEquivalentStats(returns);
  if (!Number.isFinite(stdev)) return null;
  return stdev * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
};

export const computeBestWorstPeriod = (returns) => {
  if (!returns.length) return { best: null, worst: null };
  const sorted = [...returns].sort((a, b) => a.periodReturn - b.periodReturn);
  return { worst: sorted[0], best: sorted[sorted.length - 1] };
};

// TIME-WEIGHTED RETURN - the return since inception, with deposits,
// withdrawals and new purchases neutralized.
//
// The naive first-to-last figure (computeTotalReturnPercent below) answers
// "how much bigger is the portfolio now", which is NOT a return: a
// portfolio that went from 100k to 150k purely because 50k was paid into
// it grew 0%, but reads as +50%. Any figure presented as performance has
// to exclude money crossing the portfolio boundary and reflect only what
// the assets themselves did.
//
// Method: split the series at its sampled points, compute each sub-period's
// return with Modified Dietz over the flows that landed inside it (so a
// flow gets credit/blame in proportion to how long it was actually
// invested within that sub-period), then CHAIN them geometrically:
//
//   TWR = [ (1+r1) x (1+r2) x ... x (1+rn) ] - 1
//
// Chaining is what makes it time-weighted: each sub-period is weighted by
// nothing but its own performance, so the size and timing of contributions
// cannot influence the result - which is the property that makes it the
// industry-standard way to measure an investment's performance rather than
// an investor's funding schedule (GIPS).
//
// Because the series is sampled rather than valued on every flow date,
// each sub-period is a Modified Dietz approximation rather than an exact
// daily valuation. With ~weekly sampling a flow is mis-weighted by at most
// a few days inside one sub-period, and never leaks into any other.
//
// A sub-period is skipped (treated as flat, contributing a factor of 1)
// when it has no usable base to divide by - a portfolio that was empty at
// the start of a period has no return for it, only an opening balance.
export const computeTimeWeightedReturnPercent = (series, cashFlows = []) => {
  if (!Array.isArray(series) || series.length < 2) return null;

  let growthFactor = 1;
  let measuredAnySubPeriod = false;

  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1];
    const curr = series[i];
    const flows = cashFlowsInPeriod(cashFlows, prev.date, curr.date);

    // No opening value: the portfolio started this sub-period empty (or the
    // point is unusable). Whatever it holds at the end arrived as
    // contributions, not as growth.
    if (!(prev.value > 0)) {
      // A first funding event still has to be absorbed rather than counted:
      // skipping keeps the factor at 1 for this step.
      continue;
    }

    const { percent } = calculateModifiedDietzReturn({
      beginningValue: prev.value,
      endingValue: curr.value,
      cashFlows: flows,
      periodStart: prev.date,
      periodEnd: curr.date
    });

    // Modified Dietz's denominator (beginning value + weighted flows) can
    // reach zero or go negative if a withdrawal empties the portfolio
    // mid-period; there is no meaningful return for such a step.
    if (percent === null || !Number.isFinite(percent)) continue;

    const subPeriodReturn = percent / 100;
    // A factor of 0 or less would mean the portfolio lost its entire value
    // in one step, which would zero the whole chain irrecoverably. Real
    // total-loss steps are indistinguishable here from a data gap, so the
    // step is skipped rather than allowed to swallow the series.
    if (1 + subPeriodReturn <= 0) continue;

    growthFactor *= 1 + subPeriodReturn;
    measuredAnySubPeriod = true;
  }

  if (!measuredAnySubPeriod) return null;
  return (growthFactor - 1) * 100;
};

// Total return across the whole series, and the same figure annualized
// (CAGR) so a 5-year and a 6-month portfolio can be compared. Both null
// when there isn't enough of a series to divide by.
export const computeTotalReturnPercent = (series) => {
  if (series.length < 2 || !(series[0].value > 0)) return null;
  return (series[series.length - 1].value / series[0].value - 1) * 100;
};

// Annualizes a total-return percentage over the span the series covers.
// Takes the percentage rather than re-deriving it from the endpoints, so it
// annualizes the SAME cash-flow-neutralized figure the UI displays instead
// of silently annualizing the naive one.
export const annualizeReturnPercent = (series, totalReturnPercent) => {
  if (!Array.isArray(series) || series.length < 2) return null;
  if (totalReturnPercent === null || !Number.isFinite(totalReturnPercent)) return null;
  const years = daysBetween(series[0].date, series[series.length - 1].date) / 365;
  if (years <= 0) return null;
  // Under ~a month, annualizing extrapolates noise into a headline figure
  // (a 2% week becomes "180% a year"), so it's withheld rather than shown.
  if (years < 1 / 12) return null;
  const growth = 1 + totalReturnPercent / 100;
  if (growth <= 0) return null;
  return (Math.pow(growth, 1 / years) - 1) * 100;
};

export const computeAnnualizedReturnPercent = (series) =>
  annualizeReturnPercent(series, computeTotalReturnPercent(series));

// Below this many points, volatility is too noisy to show.
const MIN_POINTS_FOR_RISK_STATS = 5;

// series: {date, value}[] - from buildSeriesFromHistoricalValues (the
// dynamic performance curve) or buildEquitySeries (saved snapshots).
// cashFlows: [{date, amount}] external flows to neutralize (see
// portfolioCashFlows.js). Omit them and the return figures fall back to the
// naive value change, which is only correct for a portfolio that was never
// paid into or out of.
export const computeStatsFromSeries = (series, cashFlows = []) => {
  const points = Array.isArray(series) ? series : [];
  const returns = computePeriodReturns(points);
  const hasEnoughForRiskStats = points.length >= MIN_POINTS_FOR_RISK_STATS;
  const { best, worst } = computeBestWorstPeriod(returns);

  // The headline "return since inception". Time-weighted, so contributions
  // and withdrawals are excluded and only the assets' own market
  // performance is left. Falls back to the naive change only when there
  // isn't a single measurable sub-period (e.g. a portfolio funded entirely
  // at the last point), where the two are the same figure anyway.
  const naiveReturnPercent = computeTotalReturnPercent(points);
  const timeWeightedReturnPercent = computeTimeWeightedReturnPercent(points, cashFlows);
  const totalReturnPercent =
    timeWeightedReturnPercent !== null ? timeWeightedReturnPercent : naiveReturnPercent;

  const netCashFlow = (cashFlows || []).reduce((sum, flow) => sum + (flow.amount || 0), 0);

  return {
    series: points,
    hasHistory: points.length >= 2,
    hasEnoughForRiskStats,
    snapshotsCount: points.length,
    firstDate: points.length ? points[0].date : null,
    lastDate: points.length ? points[points.length - 1].date : null,
    totalReturnPercent,
    // Kept separate and exposed deliberately: the difference between the
    // two is the whole point, and showing the neutralized figure without
    // being able to explain what it excluded would be worse than showing
    // neither.
    timeWeightedReturnPercent,
    naiveReturnPercent,
    netCashFlow,
    isCashFlowNeutralized: timeWeightedReturnPercent !== null,
    annualizedReturnPercent: annualizeReturnPercent(points, totalReturnPercent),
    volatilityPercent: hasEnoughForRiskStats ? computeVolatilityPercent(returns) : null,
    bestPeriod: best,
    worstPeriod: worst
  };
};

// Back-compatible entry point for the saved-snapshot series (still used for
// the monthly checkpoint side of the app).
export const computePortfolioStats = (snapshots, cashFlows = []) =>
  computeStatsFromSeries(buildEquitySeries(snapshots), cashFlows);
