// Comparing portfolio performance against a market benchmark. Both series
// get indexed to 100 at their first common date, so they are comparable
// whatever their absolute scale.
//
// Scale is not currency, though - see convertBenchmarkPointsToILS below. A
// USD index is restated in shekels BEFORE indexing, so the line the
// portfolio is measured against is the return an Israeli investor would
// actually have received from it.

// Re-bases a {date, value}[] series so the first point becomes 100 and
// every later point is relative to it. Not currently used directly by the
// UI (buildComparisonSeries below does its own indexing so both series
// share the same base date), but kept as a small building block + it's
// useful on its own for "how did stock X do since I bought it" type views.
export const indexSeriesToBase100 = (series) => {
  if (!Array.isArray(series) || series.length === 0) return [];
  const base = series[0].value;
  if (!base) return [];
  return series.map((point) => ({ date: point.date, indexed: (point.value / base) * 100 }));
};

// For each date in `dates` (ascending "YYYY-MM-DD" strings), finds the most
// recent benchmark close on or before that date - i.e. carries the last
// trading day's close forward over weekends/holidays when the market was
// closed but a portfolio snapshot still exists for that day. Returns one
// entry per input date, or null for dates before the benchmark's first
// available point.
export const alignBenchmarkClosesToDates = (dates, benchmarkPoints) => {
  if (!Array.isArray(dates)) return [];
  if (!Array.isArray(benchmarkPoints) || benchmarkPoints.length === 0) {
    return dates.map(() => null);
  }
  const sorted = [...benchmarkPoints].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let i = 0;
  let lastClose = null;
  return dates.map((date) => {
    while (i < sorted.length && sorted[i].date <= date) {
      lastClose = sorted[i].close;
      i++;
    }
    return lastClose;
  });
};

// A USD-quoted index, restated in shekels at each date's own exchange rate.
//
// WHY INDEXING TO 100 IS NOT ENOUGH.
//
// buildComparisonSeries re-bases both lines to 100, which makes them
// visually comparable whatever their scale - and that is exactly what makes
// the omission easy to miss. Re-basing removes the LEVEL difference between
// a USD index and an ILS portfolio; it does not remove the CURRENCY
// difference, because the two series then measure returns in different
// money. An S&P 500 that gained 10% in dollars over a year when the dollar
// fell 8% against the shekel returned about 1% to an Israeli investor, and
// 10% is the wrong number to hold an ILS portfolio against.
//
// The portfolio's own American holdings are already valued through the same
// historical rates (see historicalPortfolioValue.js), so converting the
// benchmark is what puts the two on one footing rather than adding a bias.
//
// Dates with no rate on or before them are dropped: a converted close is
// only as real as the rate behind it, and carrying the first known rate
// backwards would invent one.
export const convertBenchmarkPointsToILS = (benchmarkPoints, fxPoints) => {
  if (!Array.isArray(benchmarkPoints) || benchmarkPoints.length === 0) return [];
  if (!Array.isArray(fxPoints) || fxPoints.length === 0) return [];

  const dates = benchmarkPoints.map((p) => p.date);
  const rates = alignBenchmarkClosesToDates(dates, fxPoints);

  return benchmarkPoints
    .map((point, i) => ({ date: point.date, close: rates[i] === null ? null : point.close * rates[i] }))
    .filter((point) => point.close !== null && Number.isFinite(point.close));
};

// The benchmark series ready to compare against an ILS portfolio: converted
// when it is quoted in dollars, untouched when it is already in shekels.
export const benchmarkPointsInILS = (benchmarkPoints, currency, fxPoints) =>
  currency === 'USD' ? convertBenchmarkPointsToILS(benchmarkPoints, fxPoints) : benchmarkPoints || [];

// Combines a portfolio value series with a benchmark's daily closes into a
// single chart-ready series: both indexed to 100 at their first common
// date, so "my portfolio" and "the market" start together and any
// divergence afterward is real relative performance, not a scale artifact.
export const buildComparisonSeries = (portfolioSeries, benchmarkPoints) => {
  if (!Array.isArray(portfolioSeries) || portfolioSeries.length === 0) return [];

  const dates = portfolioSeries.map((p) => p.date);
  const alignedCloses = alignBenchmarkClosesToDates(dates, benchmarkPoints);

  const firstCommonIndex = alignedCloses.findIndex((c) => c !== null);
  if (firstCommonIndex === -1) return [];

  const portfolioBase = portfolioSeries[firstCommonIndex].value;
  const benchmarkBase = alignedCloses[firstCommonIndex];
  if (!portfolioBase || !benchmarkBase) return [];

  return portfolioSeries.slice(firstCommonIndex).map((point, i) => {
    const benchmarkClose = alignedCloses[firstCommonIndex + i];
    return {
      date: point.date,
      portfolioIndexed: (point.value / portfolioBase) * 100,
      benchmarkIndexed: benchmarkClose !== null ? (benchmarkClose / benchmarkBase) * 100 : null
    };
  });
};
