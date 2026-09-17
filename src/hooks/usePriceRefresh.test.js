import { renderHook } from '@testing-library/react';
import { usePriceRefresh, refreshIsraeliStocks, refreshAmericanStocks } from './usePriceRefresh';
import { fetchCurrentPrice, fetchExchangeRate, fetchIsraeliStockPrice } from '../api/stockPrices';

jest.mock('../api/stockPrices', () => ({
  fetchCurrentPrice: jest.fn(),
  fetchExchangeRate: jest.fn(),
  fetchIsraeliStockPrice: jest.fn()
}));

describe('refreshIsraeliStocks', () => {
  beforeEach(() => {
    fetchIsraeliStockPrice.mockReset();
  });

  test('does nothing when there are no Israeli stocks', async () => {
    const setIsraeliStocks = jest.fn();
    await refreshIsraeliStocks([], setIsraeliStocks);
    expect(setIsraeliStocks).not.toHaveBeenCalled();
    expect(fetchIsraeliStockPrice).not.toHaveBeenCalled();
  });

  test('requests each unique symbol only once and applies the price (converted from agorot to shekels) to every lot sharing it', async () => {
    fetchIsraeliStockPrice.mockResolvedValue({ currentPrice: 1550, changePercent: 1.2 });
    const stocks = [
      { stockName: 'TEVA', quantity: 10 },
      { stockName: 'TEVA', quantity: 5 },
      { stockName: 'ICL', quantity: 3 }
    ];
    const setIsraeliStocks = jest.fn();
    await refreshIsraeliStocks(stocks, setIsraeliStocks);

    expect(fetchIsraeliStockPrice).toHaveBeenCalledTimes(2);
    expect(fetchIsraeliStockPrice).toHaveBeenCalledWith('TEVA');
    expect(fetchIsraeliStockPrice).toHaveBeenCalledWith('ICL');

    const updated = setIsraeliStocks.mock.calls[0][0];
    expect(updated).toEqual([
      { stockName: 'TEVA', quantity: 10, currentPrice: 15.5, dailyChangePercent: 1.2 },
      { stockName: 'TEVA', quantity: 5, currentPrice: 15.5, dailyChangePercent: 1.2 },
      { stockName: 'ICL', quantity: 3, currentPrice: 15.5, dailyChangePercent: 1.2 }
    ]);
  });

  test('keeps the existing lot data untouched when no price comes back for a symbol', async () => {
    fetchIsraeliStockPrice.mockResolvedValue(null);
    const stocks = [{ stockName: 'TEVA', quantity: 10, currentPrice: 99 }];
    const setIsraeliStocks = jest.fn();
    await refreshIsraeliStocks(stocks, setIsraeliStocks);
    expect(setIsraeliStocks).toHaveBeenCalledWith([{ stockName: 'TEVA', quantity: 10, currentPrice: 99 }]);
  });

  test('degrades gracefully (keeps existing data) instead of throwing when the fetch itself rejects', async () => {
    fetchIsraeliStockPrice.mockRejectedValue(new Error('network down'));
    const stocks = [{ stockName: 'TEVA', quantity: 10, currentPrice: 99 }];
    const setIsraeliStocks = jest.fn();
    await expect(refreshIsraeliStocks(stocks, setIsraeliStocks)).resolves.toBeUndefined();
    expect(setIsraeliStocks).toHaveBeenCalledWith([{ stockName: 'TEVA', quantity: 10, currentPrice: 99 }]);
  });

  test('fetches every unique symbol in parallel, not one after another', async () => {
    const resolvers = {};
    fetchIsraeliStockPrice.mockImplementation(
      (symbol) =>
        new Promise((resolve) => {
          resolvers[symbol] = resolve;
        })
    );
    const stocks = [
      { stockName: 'A', quantity: 1 },
      { stockName: 'B', quantity: 1 },
      { stockName: 'C', quantity: 1 }
    ];
    const setIsraeliStocks = jest.fn();
    const promise = refreshIsraeliStocks(stocks, setIsraeliStocks);

    // If the symbols were requested sequentially (for...of + await, as
    // before this fix), only the first symbol's fetch would have been
    // called by this point - the rest would still be waiting their turn.
    // Flushing microtasks here (without resolving anything) lets every
    // independent Promise.all branch reach its first await.
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchIsraeliStockPrice).toHaveBeenCalledTimes(3);

    resolvers.A({ currentPrice: 100, changePercent: 0 });
    resolvers.B({ currentPrice: 200, changePercent: 0 });
    resolvers.C({ currentPrice: 300, changePercent: 0 });
    await promise;
    expect(setIsraeliStocks).toHaveBeenCalled();
  });
});

describe('refreshAmericanStocks', () => {
  beforeEach(() => {
    fetchCurrentPrice.mockReset();
    fetchExchangeRate.mockReset();
  });

  test('does nothing when there are no American stocks', async () => {
    const setAmericanStocks = jest.fn();
    await refreshAmericanStocks([], setAmericanStocks);
    expect(setAmericanStocks).not.toHaveBeenCalled();
    expect(fetchExchangeRate).not.toHaveBeenCalled();
    expect(fetchCurrentPrice).not.toHaveBeenCalled();
  });

  test('applies price and the shared exchange rate to every lot of a symbol', async () => {
    fetchExchangeRate.mockResolvedValue(3.7);
    fetchCurrentPrice.mockResolvedValue({ currentPrice: 190, changePercent: 0.8 });
    const stocks = [
      { stockName: 'AAPL', quantity: 10, exchangeRate: 3.6 },
      { stockName: 'AAPL', quantity: 2, exchangeRate: 3.5 }
    ];
    const setAmericanStocks = jest.fn();
    await refreshAmericanStocks(stocks, setAmericanStocks);

    expect(fetchCurrentPrice).toHaveBeenCalledTimes(1);
    expect(setAmericanStocks).toHaveBeenCalledWith([
      { stockName: 'AAPL', quantity: 10, exchangeRate: 3.6, currentPrice: 190, dailyChangePercent: 0.8, currentExchangeRate: 3.7 },
      { stockName: 'AAPL', quantity: 2, exchangeRate: 3.5, currentPrice: 190, dailyChangePercent: 0.8, currentExchangeRate: 3.7 }
    ]);
  });

  test('falls back to the lot\'s own exchange rate when the shared rate fetch fails, and keeps existing price data when the symbol fetch returns null', async () => {
    fetchExchangeRate.mockResolvedValue(null);
    fetchCurrentPrice.mockResolvedValue(null);
    const stocks = [{ stockName: 'AAPL', quantity: 10, currentPrice: 150, currentExchangeRate: 3.6 }];
    const setAmericanStocks = jest.fn();
    await refreshAmericanStocks(stocks, setAmericanStocks);
    expect(setAmericanStocks).toHaveBeenCalledWith([
      { stockName: 'AAPL', quantity: 10, currentPrice: 150, currentExchangeRate: 3.6 }
    ]);
  });

  test('degrades gracefully instead of throwing when the per-symbol fetch rejects', async () => {
    fetchExchangeRate.mockResolvedValue(3.7);
    fetchCurrentPrice.mockRejectedValue(new Error('network down'));
    const stocks = [{ stockName: 'AAPL', quantity: 10, exchangeRate: 3.6 }];
    const setAmericanStocks = jest.fn();
    await expect(refreshAmericanStocks(stocks, setAmericanStocks)).resolves.toBeUndefined();
    expect(setAmericanStocks).toHaveBeenCalledWith([
      { stockName: 'AAPL', quantity: 10, exchangeRate: 3.6, currentExchangeRate: 3.7 }
    ]);
  });
});

describe('usePriceRefresh', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    fetchIsraeliStockPrice.mockReset();
    fetchCurrentPrice.mockReset();
    fetchExchangeRate.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('refreshes Israeli and American stocks concurrently, not one gated behind the other', async () => {
    let resolveIsraeli;
    let resolveAmericanExchangeRate;
    fetchIsraeliStockPrice.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveIsraeli = resolve;
        })
    );
    fetchExchangeRate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAmericanExchangeRate = resolve;
        })
    );
    fetchCurrentPrice.mockResolvedValue({ currentPrice: 100, changePercent: 0 });

    renderHook(() =>
      usePriceRefresh({
        israeliStocks: [{ stockName: 'TEVA', quantity: 1 }],
        americanStocks: [{ stockName: 'AAPL', quantity: 1 }],
        setIsraeliStocks: jest.fn(),
        setAmericanStocks: jest.fn(),
        isEditMode: false,
        editingField: null,
        isAddingNewStock: false
      })
    );

    jest.advanceTimersByTime(10000);
    // Flush the microtask queue so both branches' synchronous set-up work
    // (grouping by symbol, issuing the first fetch) has a chance to run.
    await Promise.resolve();
    await Promise.resolve();

    // The American branch's exchange-rate fetch was issued WITHOUT waiting
    // for the still-pending Israeli fetch to resolve first - proving the
    // two branches run concurrently rather than the American one only
    // starting after the Israeli one finishes.
    expect(fetchIsraeliStockPrice).toHaveBeenCalled();
    expect(fetchExchangeRate).toHaveBeenCalled();

    resolveIsraeli({ currentPrice: 1000, changePercent: 0.1 });
    resolveAmericanExchangeRate(3.7);
  });

  test('skips the refresh entirely while the user is editing or adding a stock', () => {
    renderHook(() =>
      usePriceRefresh({
        israeliStocks: [{ stockName: 'TEVA', quantity: 1 }],
        americanStocks: [],
        setIsraeliStocks: jest.fn(),
        setAmericanStocks: jest.fn(),
        isEditMode: true,
        editingField: null,
        isAddingNewStock: false
      })
    );

    jest.advanceTimersByTime(10000);
    expect(fetchIsraeliStockPrice).not.toHaveBeenCalled();
  });
});
