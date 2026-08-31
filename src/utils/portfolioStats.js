// Real historical portfolio statistics, computed from saved daily value
// snapshots (see hooks/usePortfolioSnapshots.js + server/snapshotRoutes.js).
//
// Before this, the app had no history at all — every "return" figure was a
// point-in-time comparison of purchase price vs. current price. That's fine
// for per-position profit/loss, but it can't answer "how did my portfolio
// actually perform over time", "what was my worst drawdown", or "how risky
// is this, really" (the old `stock.volatility = |dailyChange| * 1.5` in
// portfolioAnalysis.js was a rough stand-in, not a real measure).
//
// These stats need at least a handful of snapshots to mean anything, and
// they'll only start being useful days/weeks after this feature ships -
// there's no way around that other than actually collecting history.

// Normalizes raw snapshot rows (as returned by GET /api/portfolio-snapshots)
// into a clean, sorted {date, value}[] series.
export const buildEquitySeries = (snapshots) => {
  if (!Array.isArray(snapshots)) return [];
  return snapshots
    .filter((s) => s && s.date && Number.isFinite(Number(s.totalValueILS)))
    .map((s) => ({ date: s.date, value: Number(s.totalValueILS) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
};

const daysBetween = (d1, d2) => {
  const a = new Date(d1);
  const b = new Date(d2);
  const days = (b - a) / (1000 * 60 * 60 * 24);
  return days > 0 ? days : 0.5; // guard against same-day duplicates / clock skew
};

// Largest peak-to-trough drop in the series (as a positive percentage).
export const computeMaxDrawdown = (series) => {
  if (!series.length) {
    return { maxDrawdownPercent: 0, peakDate: null, troughDate: null };
  }
  let peak = series[0].value;
  let peakDate = series[0].date;
  let maxDD = 0;
  let maxDDPeakDate = series[0].date;
  let maxDDTroughDate = series[0].date;

  series.forEach((point) => {
    if (point.value > peak) {
      peak = point.value;
      peakDate = point.date;
    }
    if (peak > 0) {
      const dd = (peak - point.value) / peak;
      if (dd > maxDD) {
        maxDD = dd;
        maxDDPeakDate = peakDate;
        maxDDTroughDate = point.date;
      }
    }
  });

  return { maxDrawdownPercent: maxDD * 100, peakDate: maxDDPeakDate, troughDate: maxDDTroughDate };
};

// Returns between consecutive snapshots, each tagged with the number of
// calendar days that elapsed (snapshots are only taken when the user opens
// the app, so gaps are expected and irregular - this is not a trading-day
// series).
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
// ((1+r)^(1/days) - 1) so unevenly-spaced snapshots can be compared on the
// same footing, then returns their mean/stdev. This is the shared core of
// both volatility and Sharpe below.
const dailyEquivalentStats = (returns) => {
  const dailyEquivalents = returns.map((r) => Math.pow(1 + r.periodReturn, 1 / r.days) - 1);
  const mean = dailyEquivalents.reduce((s, v) => s + v, 0) / dailyEquivalents.length;
  const variance =
    dailyEquivalents.reduce((s, v) => s + Math.pow(v - mean, 2), 0) /
    Math.max(dailyEquivalents.length - 1, 1);
  return { mean, stdev: Math.sqrt(variance) };
};

// Annualized volatility (%), approximated by scaling the daily-equivalent
// stdev by sqrt(252) trading days - the standard convention, even though
// our "days" are calendar days sampled irregularly. Good enough to compare
// your own portfolio's risk over time; not a substitute for a real pricing
// data feed.
export const computeVolatilityPercent = (returns) => {
  if (returns.length < 2) return null;
  const { stdev } = dailyEquivalentStats(returns);
  return stdev * Math.sqrt(252) * 100;
};

// Annualized Sharpe ratio: (annualized return - risk-free rate) / annualized
// volatility. riskFreeAnnualPercent defaults to 0; pass e.g. the current
// Makam/T-bill yield for a more meaningful number.
export const computeSharpeRatio = (returns, riskFreeAnnualPercent = 0) => {
  if (returns.length < 2) return null;
  const { mean, stdev } = dailyEquivalentStats(returns);
  if (stdev === 0) return null;
  const annualizedReturn = Math.pow(1 + mean, 252) - 1;
  const annualizedStdev = stdev * Math.sqrt(252);
  return (annualizedReturn - riskFreeAnnualPercent / 100) / annualizedStdev;
};

export const computeBestWorstPeriod = (returns) => {
  if (!returns.length) return { best: null, worst: null };
  const sorted = [...returns].sort((a, b) => a.periodReturn - b.periodReturn);
  return { worst: sorted[0], best: sorted[sorted.length - 1] };
};

// Below this many snapshots, volatility/Sharpe are too noisy to show -
// we still show the equity curve and drawdown (which are meaningful with
// as few as 2 points).
const MIN_SNAPSHOTS_FOR_RISK_STATS = 5;

export const computePortfolioStats = (snapshots, riskFreeAnnualPercent = 0) => {
  const series = buildEquitySeries(snapshots);
  const returns = computePeriodReturns(series);
  const hasEnoughForRiskStats = series.length >= MIN_SNAPSHOTS_FOR_RISK_STATS;
  const { maxDrawdownPercent, peakDate, troughDate } = computeMaxDrawdown(series);
  const { best, worst } = computeBestWorstPeriod(returns);

  return {
    series,
    hasHistory: series.length >= 2,
    hasEnoughForRiskStats,
    snapshotsCount: series.length,
    firstDate: series.length ? series[0].date : null,
    lastDate: series.length ? series[series.length - 1].date : null,
    totalReturnPercent:
      series.length >= 2 && series[0].value > 0
        ? (series[series.length - 1].value / series[0].value - 1) * 100
        : null,
    maxDrawdownPercent,
    drawdownPeakDate: peakDate,
    drawdownTroughDate: troughDate,
    volatilityPercent: hasEnoughForRiskStats ? computeVolatilityPercent(returns) : null,
    sharpeRatio: hasEnoughForRiskStats ? computeSharpeRatio(returns, riskFreeAnnualPercent) : null,
    bestPeriod: best,
    worstPeriod: worst
  };
};
