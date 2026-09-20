import { renderHook, waitFor } from '@testing-library/react';
import { useHistoricalPortfolioValue } from './useHistoricalPortfolioValue';

describe('useHistoricalPortfolioValue', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
  });

  function mockResponses({ israeli, american, fx }) {
    global.fetch.mockImplementation((url) => {
      const u = String(url);
      if (u.includes('israeli-stocks-history')) return Promise.resolve({ ok: true, json: async () => ({ history: israeli || {} }) });
      if (u.includes('american-stocks-history')) return Promise.resolve({ ok: true, json: async () => ({ history: american || {} }) });
      if (u.includes('exchange-rate-history')) return Promise.resolve({ ok: true, json: async () => ({ history: fx || [] }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
  }

  test('does not fetch anything when fromDate/toDate are not set', () => {
    mockResponses({});
    renderHook(() =>
      useHistoricalPortfolioValue({ fromDate: null, toDate: null, israeliStocks: [], americanStocks: [] })
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('fetches Israeli history and computes a series when only Israeli holdings exist (no FX call needed)', async () => {
    mockResponses({ israeli: { '629014': [{ date: '2024-01-01', close: 10000 }] } });

    const { result } = renderHook(() =>
      useHistoricalPortfolioValue({
        fromDate: '2024-01-01',
        toDate: '2024-01-01',
        israeliStocks: [{ stockName: '629014', quantity: 10, purchaseDate: '2024-01-01' }],
        americanStocks: []
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.series).toMatchObject([{ date: '2024-01-01', valueILS: 1000, isPartial: false }]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/israeli-stocks-history'),
      expect.objectContaining({ method: 'POST' })
    );
    // No American holdings -> no FX/American calls at all.
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('american-stocks-history'), expect.anything());
    expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('exchange-rate-history'));
  });

  test('fetches American history and FX together, computing a combined ILS value', async () => {
    mockResponses({
      american: { AAPL: [{ date: '2024-01-01', close: 150 }] },
      fx: [{ date: '2024-01-01', close: 3.6 }]
    });

    const { result } = renderHook(() =>
      useHistoricalPortfolioValue({
        fromDate: '2024-01-01',
        toDate: '2024-01-01',
        israeliStocks: [],
        americanStocks: [{ stockName: 'AAPL', quantity: 5, purchaseDate: '2024-01-01' }]
      })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.series[0].valueILS).toBeCloseTo(5 * 150 * 3.6, 5);
  });

  test('surfaces an error message and computes an isPartial/null-value point (not stale/fake data) when a fetch call fails', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() =>
      useHistoricalPortfolioValue({
        fromDate: '2024-01-01',
        toDate: '2024-01-01',
        israeliStocks: [{ stockName: '629014', quantity: 10, purchaseDate: '2024-01-01' }],
        americanStocks: []
      })
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.series).toMatchObject([{ date: '2024-01-01', valueILS: null, isPartial: true }]);
    expect(result.current.error).toBeTruthy();
  });

  test('recomputes the series when the live quantity changes, without needing fromDate/toDate to change', async () => {
    mockResponses({ israeli: { '629014': [{ date: '2024-01-01', close: 10000 }] } });
    const { result, rerender } = renderHook(
      ({ israeliStocks }) =>
        useHistoricalPortfolioValue({ fromDate: '2024-01-01', toDate: '2024-01-01', israeliStocks, americanStocks: [] }),
      { initialProps: { israeliStocks: [{ stockName: '629014', quantity: 10, purchaseDate: '2024-01-01' }] } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.series[0].valueILS).toBe(1000);

    rerender({ israeliStocks: [{ stockName: '629014', quantity: 20, purchaseDate: '2024-01-01' }] });
    await waitFor(() => expect(result.current.series[0].valueILS).toBe(2000));
    // Same symbol set -> no extra network call was needed to reflect the new quantity.
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
