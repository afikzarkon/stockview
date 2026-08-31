// Formatting/interpretation helpers for Yahoo's analyst coverage data
// (financialData + recommendationTrend + upgradeDowngradeHistory modules —
// see server/yahooQuotes.js:fetchYahooAnalystData). Kept as pure functions,
// separate from the fetching hook, so they're independently testable.

const RECOMMENDATION_LABELS_HE = {
  strong_buy: 'קנייה חזקה',
  buy: 'קנייה',
  hold: 'החזקה',
  underperform: 'תשואת חסר',
  sell: 'מכירה',
  strong_sell: 'מכירה חזקה',
  none: 'אין המלצה'
};

export const recommendationLabelHe = (recommendationKey) => {
  if (!recommendationKey) return 'לא ידוע';
  const normalized = String(recommendationKey).toLowerCase();
  return RECOMMENDATION_LABELS_HE[normalized] || recommendationKey;
};

// For CSS classes (profit-positive / profit-negative already exist in
// App.css) — buy-side ratings are "positive", sell-side are "negative",
// hold is neutral (no class).
export const recommendationSentiment = (recommendationKey) => {
  if (!recommendationKey) return null;
  const normalized = String(recommendationKey).toLowerCase();
  if (normalized === 'strong_buy' || normalized === 'buy') return 'positive';
  if (normalized === 'sell' || normalized === 'strong_sell' || normalized === 'underperform') return 'negative';
  return null;
};

// % gap between the current price and the analysts' average target -
// positive means the target is above the current price (upside).
export const computeUpsidePercent = (currentPrice, targetMeanPrice) => {
  if (!currentPrice || !targetMeanPrice) return null;
  return ((targetMeanPrice - currentPrice) / currentPrice) * 100;
};

// Yahoo's upgradeDowngradeHistory 'action' field is one of a small fixed
// set of short codes.
const ACTION_LABELS_HE = {
  up: 'שדרוג',
  down: 'הורדה',
  main: 'שימור דירוג',
  init: 'תחילת סיקור',
  reit: 'אישור דירוג'
};

export const actionLabelHe = (action) => {
  if (!action) return '';
  const normalized = String(action).toLowerCase();
  return ACTION_LABELS_HE[normalized] || action;
};

export const formatEpochDateISO = (epochSeconds) => {
  if (!Number.isFinite(epochSeconds)) return null;
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
};

// Total number of analyst opinions represented in the current-month
// recommendationTrend bucket, or null if there's nothing to sum.
export const totalTrendOpinions = (currentTrend) => {
  if (!currentTrend) return null;
  const { strongBuy, buy, hold, sell, strongSell } = currentTrend;
  const values = [strongBuy, buy, hold, sell, strongSell].filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0);
};
