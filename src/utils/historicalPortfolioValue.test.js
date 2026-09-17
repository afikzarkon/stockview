import { computePortfolioValueAtDate, computeHistoricalPortfolioSeries } from './historicalPortfolioValue';

describe('computePortfolioValueAtDate', () => {
  test('computes an Israeli-only holding value from the carried-forward close on or before the date', () => {
    const holdings = {
      israeliStocks: [{ stockName: '629014', quantity: 10, purchaseDate: '2024-01-01' }],
      americanStocks: []
    };
    const priceData = {
      taseHistoricalCloses: {
        '629014': [
          { date: '2024-01-01', close: 10000 }, // 100 ILS
          { date: '2024-06-01', close: 11000 } // 110 ILS
        ]
      }
    };
    // 2024-03-15 has no exact close - carries forward the 2024-01-01 close.
    const result = computePortfolioValueAtDate('2024-03-15', holdings, priceData);
    expect(result).toEqual({ date: '2024-03-15', valueILS: 1000, isPartial: false }); // 10 * 100
  });

  test('computes an American holding value converted to ILS via the carried-forward FX rate', () => {
    const holdings = {
      israeliStocks: [],
      americanStocks: [{ stockName: 'AAPL', quantity: 5, purchaseDate: '2024-01-01' }]
    };
    const priceData = {
      yahooHistoricalCloses: { AAPL: [{ date: '2024-01-01', close: 150 }] },
      fxHistoricalCloses: [{ date: '2024-01-01', close: 3.6 }]
    };
    const result = computePortfolioValueAtDate('2024-02-01', holdings, priceData);
    expect(result.valueILS).toBeCloseTo(5 * 150 * 3.6, 5); // 2700
    expect(result.isPartial).toBe(false);
  });

  test('sums multiple lots of the same symbol as one combined quantity', () => {
    const holdings = {
      israeliStocks: [
        { stockName: '629014', quantity: 10, purchaseDate: '2024-01-01' },
        { stockName: '629014', quantity: 5, purchaseDate: '2024-02-01' }
      ],
      americanStocks: []
    };
    const priceData = { taseHistoricalCloses: { '629014': [{ date: '2024-01-01', close: 10000 }] } };
    const result = computePortfolioValueAtDate('2024-03-01', holdings, priceData);
    expect(result.valueILS).toBe(1500); // (10+5) * 100
  });

  test('excludes a lot purchased after the requested date - "as of" never counts a future purchase', () => {
    const holdings = {
      israeliStocks: [{ stockName: '629014', quantity: 10, purchaseDate: '2024-06-01' }],
      americanStocks: []
    };
    const priceData = { taseHistoricalCloses: { '629014': [{ date: '2024-01-01', close: 10000 }] } };
    const result = computePortfolioValueAtDate('2024-03-01', holdings, priceData);
    expect(result).toEqual({ date: '2024-03-01', valueILS: null, isPartial: false });
  });

  test('flags isPartial and skips a holding with no price data at all on or before the date', () => {
    const holdings = {
      israeliStocks: [{ stockName: '629014', quantity: 10, purchaseDate: '2024-01-01' }],
      americanStocks: [{ stockName: 'AAPL', quantity: 5, purchaseDate: '2024-01-01' }]
    };
    const priceData = {
      taseHistoricalCloses: { '629014': [{ date: '2024-01-01', close: 10000 }] },
      yahooHistoricalCloses: {}, // AAPL missing entirely
      fxHistoricalCloses: [{ date: '2024-01-01', close: 3.6 }]
    };
    const result = computePortfolioValueAtDate('2024-03-01', holdings, priceData);
    expect(result.valueILS).toBe(1000); // Israeli leg still counted
    expect(result.isPartial).toBe(true); // American leg couldn't be priced
  });

  test('returns valueILS null (not 0 or NaN) when there are no holdings at all', () => {
    const result = computePortfolioValueAtDate('2024-03-01', { israeliStocks: [], americanStocks: [] }, {});
    expect(result).toEqual({ date: '2024-03-01', valueILS: null, isPartial: false });
  });

  test('handles missing holdings/priceData arguments gracefully', () => {
    expect(computePortfolioValueAtDate('2024-03-01')).toEqual({ date: '2024-03-01', valueILS: null, isPartial: false });
  });
});

describe('computeHistoricalPortfolioSeries', () => {
  const holdings = { israeliStocks: [{ stockName: '629014', quantity: 10, purchaseDate: '2024-01-01' }], americanStocks: [] };
  const priceData = { taseHistoricalCloses: { '629014': [{ date: '2024-01-01', close: 10000 }] } };

  test('samples weekly points across the range and always includes the exact toDate as the last point', () => {
    const series = computeHistoricalPortfolioSeries('2024-01-01', '2024-01-20', holdings, priceData);
    const dates = series.map((p) => p.date);
    expect(dates[0]).toBe('2024-01-01');
    expect(dates[dates.length - 1]).toBe('2024-01-20');
    // 2024-01-01, -08, -15 are exactly 7 days apart, then the exact end date is appended
    expect(dates).toEqual(['2024-01-01', '2024-01-08', '2024-01-15', '2024-01-20']);
  });

  test('returns an empty array when fromDate is after toDate, or either is missing/invalid', () => {
    expect(computeHistoricalPortfolioSeries('2024-02-01', '2024-01-01', holdings, priceData)).toEqual([]);
    expect(computeHistoricalPortfolioSeries(null, '2024-01-01', holdings, priceData)).toEqual([]);
    expect(computeHistoricalPortfolioSeries('2024-01-01', 'not-a-date', holdings, priceData)).toEqual([]);
  });

  test('a single-day range returns exactly one point', () => {
    const series = computeHistoricalPortfolioSeries('2024-01-01', '2024-01-01', holdings, priceData);
    expect(series.map((p) => p.date)).toEqual(['2024-01-01']);
  });
});
