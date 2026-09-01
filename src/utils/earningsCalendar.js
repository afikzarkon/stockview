// Upcoming earnings dates for US holdings. Reads from the same per-symbol
// data the dividend tracking section already fetches (useDividendData /
// server/dividendRoutes.js) - Yahoo's calendarEvents module returns
// earnings AND dividend dates together in one response, so this doesn't
// need its own fetch or hook (see fetchYahooDividendSummary in
// yahooQuotes.js for the full rationale). Kept as a separate util module
// from dividendAnalysis.js because "next earnings date" and "dividend
// tracking" are different questions for the reader, even though they share
// a data source under the hood.
import { formatEpochDateISO } from './analystData';

// One row per US symbol with a known future earnings date, soonest first.
// Only future dates - same reasoning as buildUpcomingDividendCalendar: a
// stale estimate left over from the last report isn't useful in a "coming
// up" list.
export const buildUpcomingEarningsCalendar = (dividendsBySymbol, todayISO) => {
  const today = todayISO || new Date().toISOString().slice(0, 10);
  const rows = [];
  Object.entries(dividendsBySymbol || {}).forEach(([symbol, data]) => {
    const date = formatEpochDateISO(data?.earningsDateEpoch);
    if (!date || date < today) return;
    rows.push({
      symbol,
      date,
      isEstimate: data?.isEarningsDateEstimate ?? null,
      epsEstimateAverage: data?.epsEstimateAverage ?? null,
      revenueEstimateAverage: data?.revenueEstimateAverage ?? null
    });
  });
  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
};
