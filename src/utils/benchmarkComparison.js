// Comparing portfolio performance against a market benchmark (S&P 500 /
// TA-125). Both series get indexed to 100 at their first common date, so
// they're directly comparable regardless of currency or absolute scale -
// an ILS portfolio total vs. a USD index level, for example.

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
