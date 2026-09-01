import { buildUpcomingEarningsCalendar } from './earningsCalendar';

describe('buildUpcomingEarningsCalendar', () => {
  test('includes only future dates, sorted soonest first', () => {
    const dividendsBySymbol = {
      AAPL: { earningsDateEpoch: toEpoch('2024-08-01'), isEarningsDateEstimate: true, epsEstimateAverage: 1.5 },
      MSFT: { earningsDateEpoch: toEpoch('2024-07-01'), isEarningsDateEstimate: false, epsEstimateAverage: 3.1 },
      KO: { earningsDateEpoch: toEpoch('2024-01-01'), isEarningsDateEstimate: false, epsEstimateAverage: 0.5 } // past
    };
    const rows = buildUpcomingEarningsCalendar(dividendsBySymbol, '2024-06-15');
    expect(rows.map((r) => r.symbol)).toEqual(['MSFT', 'AAPL']);
    expect(rows[0]).toEqual({
      symbol: 'MSFT',
      date: '2024-07-01',
      isEstimate: false,
      epsEstimateAverage: 3.1,
      revenueEstimateAverage: null
    });
  });

  test('excludes a symbol with no earnings date at all', () => {
    const dividendsBySymbol = { XYZ: { earningsDateEpoch: null } };
    expect(buildUpcomingEarningsCalendar(dividendsBySymbol, '2024-06-15')).toEqual([]);
  });

  test('handles missing/empty input without throwing', () => {
    expect(buildUpcomingEarningsCalendar({}, '2024-06-15')).toEqual([]);
    expect(buildUpcomingEarningsCalendar(null, '2024-06-15')).toEqual([]);
  });

  test('defaults "today" to the real current date when not provided', () => {
    const past = { earningsDateEpoch: toEpoch('2000-01-01') };
    expect(buildUpcomingEarningsCalendar({ OLD: past })).toEqual([]);
  });
});

function toEpoch(dateStr) {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
}
