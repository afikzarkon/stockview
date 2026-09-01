// A single composite 0-100 "portfolio health" score, built from metrics
// the app already computes elsewhere: concentration (portfolioAnalysis.js),
// sector concentration (sectorAnalysis.js), correlation between holdings
// (correlationAnalysis.js), volatility/drawdown (portfolioStats.js), and
// allocation drift from rebalancing targets (rebalancing.js). This is a
// heuristic for quick orientation - "which lever is worst right now" - not
// financial advice or a scientifically validated risk score.
//
// Each sub-score maps its metric linearly onto 0-100 (100 = best) against a
// deliberately round reference range documented per metric below - a
// self-consistent scale, not a claim about what's "good" in any absolute
// sense. A sub-score whose underlying data isn't available yet (e.g. no
// rebalancing targets set, or fewer than 2 US holdings for correlation) is
// left out of the average entirely rather than defaulting to a fake
// midpoint - a portfolio isn't penalized for a metric it hasn't opted into.

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// 100 at 0% concentrated, 0 at 100% concentrated in the top 3 positions -
// a portfolio entirely in 3 positions is the worst practical case.
const concentrationScore = (concentrationTop3Percent) => {
  if (!Number.isFinite(concentrationTop3Percent)) return null;
  return Math.round(clamp(100 - concentrationTop3Percent, 0, 100));
};

const sectorConcentrationScore = (topSectorPercent) => {
  if (!Number.isFinite(topSectorPercent)) return null;
  return Math.round(clamp(100 - topSectorPercent, 0, 100));
};

// 100 at 0 average |correlation| between US holdings, 0 at a perfect 1.0 -
// stocks moving in lockstep is the worst practical case for this metric.
const correlationScore = (averageAbsCorrelationValue) => {
  if (!Number.isFinite(averageAbsCorrelationValue)) return null;
  return Math.round(clamp(100 - averageAbsCorrelationValue * 100, 0, 100));
};

const VOLATILITY_REFERENCE_MAX_PERCENT = 40; // annualized - "about as high as a real equity portfolio gets"
const volatilityScore = (volatilityPercent) => {
  if (!Number.isFinite(volatilityPercent)) return null;
  return Math.round(clamp(100 - (volatilityPercent / VOLATILITY_REFERENCE_MAX_PERCENT) * 100, 0, 100));
};

const DRAWDOWN_REFERENCE_MAX_PERCENT = 50; // "about as deep as a real bear-market drawdown gets"
const drawdownScore = (maxDrawdownPercent) => {
  if (!Number.isFinite(maxDrawdownPercent)) return null;
  return Math.round(clamp(100 - (maxDrawdownPercent / DRAWDOWN_REFERENCE_MAX_PERCENT) * 100, 0, 100));
};

const ALLOCATION_DRIFT_REFERENCE_MAX_PERCENT = 30; // "one category is 30pp off its target" is already a lot
const allocationDriftScore = (maxAbsDiffPercent) => {
  if (!Number.isFinite(maxAbsDiffPercent)) return null;
  return Math.round(clamp(100 - (maxAbsDiffPercent / ALLOCATION_DRIFT_REFERENCE_MAX_PERCENT) * 100, 0, 100));
};

// Average |correlation| across every pair in a correlationAnalysis.js
// matrix - a single "how coupled are my US holdings" number. null if there
// are fewer than 2 symbols, or no pair has enough shared history to have
// produced a value.
export const averageAbsCorrelation = (symbols, matrix) => {
  if (!Array.isArray(symbols) || !Array.isArray(matrix)) return null;
  const values = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const value = matrix[i] && matrix[i][j];
      if (value === null || value === undefined) continue;
      values.push(Math.abs(value));
    }
  }
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

export const HEALTH_SCORE_SUBSCORE_LABELS_HE = {
  concentration: 'ריכוזיות (3 פוזיציות מובילות)',
  sectorConcentration: 'ריכוזיות סקטור (ארה"ב)',
  correlation: 'קורלציה בין אחזקות (ארה"ב)',
  volatility: 'תנודתיות',
  drawdown: 'ירידה מקסימלית',
  allocationDrift: 'סטייה מיעדי איזון'
};

export const healthScoreLabelHe = (score) => {
  if (score === null || score === undefined) return 'אין מספיק נתונים';
  if (score >= 80) return 'מצוין';
  if (score >= 60) return 'טוב';
  if (score >= 40) return 'בינוני';
  return 'טעון שיפור';
};

// Builds the full breakdown: each named sub-score (or null if its
// underlying data isn't ready), plus the overall score - the average of
// only the sub-scores that ARE available.
export const computePortfolioHealthScore = ({
  concentrationTop3Percent,
  topSectorPercent,
  correlationSymbols,
  correlationMatrix,
  volatilityPercent,
  maxDrawdownPercent,
  allocationMaxAbsDiffPercent
} = {}) => {
  const breakdown = {
    concentration: concentrationScore(concentrationTop3Percent),
    sectorConcentration: sectorConcentrationScore(topSectorPercent),
    correlation: correlationScore(averageAbsCorrelation(correlationSymbols, correlationMatrix)),
    volatility: volatilityScore(volatilityPercent),
    drawdown: drawdownScore(maxDrawdownPercent),
    allocationDrift: allocationDriftScore(allocationMaxAbsDiffPercent)
  };

  const availableScores = Object.values(breakdown).filter((v) => v !== null);
  const overallScore =
    availableScores.length === 0
      ? null
      : Math.round(availableScores.reduce((sum, v) => sum + v, 0) / availableScores.length);

  return { overallScore, breakdown, availableCount: availableScores.length };
};
