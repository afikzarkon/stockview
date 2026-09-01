// Correlation between holdings' historical daily returns - "when stock A
// moves, does stock B tend to move with it?" A portfolio can look
// diversified by sector/exchange and still have its top holdings move
// almost in lockstep, which neither of those breakdowns can show. Scoped
// to American stocks only: TASE doesn't have a dependency-free historical
// closes source the way Yahoo's chart endpoint does (see server/
// correlationRoutes.js and project notes on TASE scraping).

// Below this many overlapping trading days, a correlation coefficient is
// more noise than signal - two symbols with only a handful of shared dates
// (e.g. one was bought right before the fetch window) get null instead of
// a misleadingly precise-looking number.
const MIN_OVERLAPPING_RETURNS = 20;

// {date, close}[] (ascending by date, as fetchYahooHistoricalCloses returns
// them) -> {date, return}[] of day-over-day % change.
export const computeDailyReturns = (points) => {
  if (!Array.isArray(points) || points.length < 2) return [];
  const returns = [];
  for (let i = 1; i < points.length; i++) {
    const prevClose = points[i - 1]?.close;
    const close = points[i]?.close;
    if (!prevClose || !Number.isFinite(prevClose) || !Number.isFinite(close)) continue;
    returns.push({ date: points[i].date, return: close / prevClose - 1 });
  }
  return returns;
};

// Pearson correlation coefficient between two return series, matched by
// date (inner join) rather than by index - handles symbols with slightly
// different trading calendars (different listing dates, different
// exchange holidays) without requiring every symbol to share every date.
// Returns null when there isn't enough overlapping history to trust.
export const pearsonCorrelation = (returnsA, returnsB) => {
  if (!Array.isArray(returnsA) || !Array.isArray(returnsB)) return null;
  const byDateB = new Map(returnsB.map((r) => [r.date, r.return]));
  const pairs = [];
  returnsA.forEach((r) => {
    if (byDateB.has(r.date)) pairs.push([r.return, byDateB.get(r.date)]);
  });
  if (pairs.length < MIN_OVERLAPPING_RETURNS) return null;

  const n = pairs.length;
  const meanA = pairs.reduce((s, [a]) => s + a, 0) / n;
  const meanB = pairs.reduce((s, [, b]) => s + b, 0) / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  pairs.forEach(([a, b]) => {
    const da = a - meanA;
    const db = b - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  });
  if (varA === 0 || varB === 0) return null;
  return cov / Math.sqrt(varA * varB);
};

// historyBySymbol: { SYMBOL: {date, close}[] } -> { symbols, matrix }.
// symbols is sorted alphabetically for a stable table order; matrix[i][j]
// is the correlation between symbols[i] and symbols[j] (1 on the diagonal,
// null where there isn't enough shared history).
export const buildCorrelationMatrix = (historyBySymbol) => {
  const symbols = Object.keys(historyBySymbol || {})
    .filter((s) => Array.isArray(historyBySymbol[s]) && historyBySymbol[s].length >= 2)
    .sort();

  const returnsBySymbol = {};
  symbols.forEach((s) => {
    returnsBySymbol[s] = computeDailyReturns(historyBySymbol[s]);
  });

  const matrix = symbols.map((rowSymbol, i) =>
    symbols.map((colSymbol, j) => {
      if (i === j) return 1;
      return pearsonCorrelation(returnsBySymbol[rowSymbol], returnsBySymbol[colSymbol]);
    })
  );

  return { symbols, matrix };
};

// The most tightly-coupled pairs in the matrix, ranked by |correlation| -
// a quick "these two move together the most" callout instead of making
// the reader scan the whole grid. Excludes the diagonal and null entries.
export const highestCorrelatedPairs = (symbols, matrix, limit = 3) => {
  if (!Array.isArray(symbols) || !Array.isArray(matrix)) return [];
  const pairs = [];
  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const correlation = matrix[i] && matrix[i][j];
      if (correlation === null || correlation === undefined) continue;
      pairs.push({ a: symbols[i], b: symbols[j], correlation });
    }
  }
  return pairs.sort((x, y) => Math.abs(y.correlation) - Math.abs(x.correlation)).slice(0, limit);
};
