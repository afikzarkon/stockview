import { renderHook, waitFor } from '@testing-library/react';
import { createSymbolStore, useSymbolReferenceData } from './useSymbolReferenceData';

const makeStore = () => createSymbolStore({ endpoint: '/api/stock-sectors', responseKey: 'sectors' });

const respondWith = (sectors) =>
  jest.fn().mockResolvedValue({ ok: true, json: async () => ({ sectors }) });

describe('useSymbolReferenceData', () => {
  afterEach(() => {
    delete global.fetch;
    jest.restoreAllMocks();
  });

  test('fetches the symbols it does not have and returns them keyed by symbol', async () => {
    global.fetch = respondWith({ NVDA: { sector: 'Technology' } });
    const store = makeStore();

    const { result } = renderHook(() => useSymbolReferenceData(store, ['nvda']));

    await waitFor(() => expect(result.current.data.NVDA).toEqual({ sector: 'Technology' }));
    // Tickers are normalised before they go out.
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).symbols).toEqual(['NVDA']);
  });

  // The cache used to live in a ref, so leaving the analysis page and
  // coming back re-requested sector classifications that cannot have
  // changed. A module-level store outlives the component.
  test('a remount serves from the store without asking again', async () => {
    global.fetch = respondWith({ NVDA: { sector: 'Technology' } });
    const store = makeStore();

    const first = renderHook(() => useSymbolReferenceData(store, ['NVDA']));
    await waitFor(() => expect(first.result.current.data.NVDA).toBeTruthy());
    first.unmount();

    const second = renderHook(() => useSymbolReferenceData(store, ['NVDA']));
    // Already present on the very first render - no empty flash.
    expect(second.result.current.data.NVDA).toEqual({ sector: 'Technology' });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('asks only for the symbols it is missing', async () => {
    global.fetch = respondWith({ NVDA: { sector: 'Technology' } });
    const store = makeStore();

    const first = renderHook(() => useSymbolReferenceData(store, ['NVDA']));
    await waitFor(() => expect(first.result.current.data.NVDA).toBeTruthy());

    global.fetch = respondWith({ AAPL: { sector: 'Consumer Electronics' } });
    const second = renderHook(() => useSymbolReferenceData(store, ['NVDA', 'AAPL']));

    await waitFor(() => expect(second.result.current.data.AAPL).toBeTruthy());
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).symbols).toEqual(['AAPL']);
    // The cached one is still there alongside the newly fetched one.
    expect(second.result.current.data.NVDA).toBeTruthy();
  });

  test('does not fire for an empty symbol list', async () => {
    global.fetch = respondWith({});
    const store = makeStore();

    renderHook(() => useSymbolReferenceData(store, []));
    await new Promise((r) => setTimeout(r, 30));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  // Every one of these feeds a section well below the fold, so a failure
  // shows as "not available" in that section and never as a broken page.
  test('a failed request leaves the hook usable rather than throwing', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    const store = makeStore();

    const { result } = renderHook(() => useSymbolReferenceData(store, ['NVDA']));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({});
  });

  test('a non-ok response is treated as a failure, not as empty data', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const store = makeStore();

    const { result } = renderHook(() => useSymbolReferenceData(store, ['NVDA']));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({});
    // Nothing was cached, so a later mount will try again.
    expect(store.missing(['NVDA'])).toEqual(['NVDA']);
  });

  test('passes the extra body through (the dividend history start date)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ dividends: {} }) });
    const store = createSymbolStore({ endpoint: '/api/dividend-data', responseKey: 'dividends' });

    renderHook(() => useSymbolReferenceData(store, ['NVDA'], { from: '2020-01-01' }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
      symbols: ['NVDA'],
      from: '2020-01-01'
    });
  });

  // Two sections mounting at once must not each ask for the same ticker.
  test('concurrent mounts share one in-flight request per symbol', async () => {
    let release;
    global.fetch = jest.fn(
      () => new Promise((r) => { release = () => r({ ok: true, json: async () => ({ sectors: { NVDA: { sector: 'Technology' } } }) }); })
    );
    const store = makeStore();

    const a = renderHook(() => useSymbolReferenceData(store, ['NVDA']));
    const b = renderHook(() => useSymbolReferenceData(store, ['NVDA']));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    release();

    await waitFor(() => expect(a.result.current.data.NVDA).toBeTruthy());
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(b.result.current.loading).toBe(false);
  });
});
