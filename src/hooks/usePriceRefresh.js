// Automatic price refresh: polls TASE/Yahoo prices every 10s and updates
// the stock arrays, unless the user is mid-edit or mid-add.
// Extracted from App.js — behavior is unchanged, only the location moved.

import { useEffect, useRef } from 'react';
import { fetchCurrentPrice, fetchExchangeRate, fetchIsraeliStockPrice } from '../api/stockPrices';

const POLLING_INTERVAL_MS = 10000;

// Groups stocks by symbol (stockName) so each unique symbol is only
// requested once, no matter how many purchase lots reference it.
function groupBySymbol(stocks) {
  const stocksBySymbol = {};
  stocks.forEach((stock) => {
    if (!stocksBySymbol[stock.stockName]) {
      stocksBySymbol[stock.stockName] = [];
    }
    stocksBySymbol[stock.stockName].push(stock);
  });
  return stocksBySymbol;
}

// Fetches a fresh price for every unique Israeli symbol IN PARALLEL
// (Promise.all over the per-symbol fetches, instead of the previous
// for...of + await loop that requested one symbol at a time) and applies
// it to every lot sharing that symbol.
export async function refreshIsraeliStocks(israeliStocks, setIsraeliStocks) {
  if (israeliStocks.length === 0) return;

  const stocksBySymbol = groupBySymbol(israeliStocks);

  const updatedGroups = await Promise.all(
    Object.entries(stocksBySymbol).map(async ([stockSymbol, stocks]) => {
      let priceData = null;
      try {
        priceData = await fetchIsraeliStockPrice(stockSymbol);
      } catch (error) {
        priceData = null;
      }

      if (priceData && priceData.currentPrice !== null) {
        // Convert from agorot to shekels
        const normalizedPrice = priceData.currentPrice / 100;
        return stocks.map((stock) => ({
          ...stock,
          currentPrice: normalizedPrice,
          dailyChangePercent: priceData.changePercent
        }));
      }
      // No price returned — keep the existing data
      return stocks;
    })
  );

  setIsraeliStocks(updatedGroups.flat());
}

// Same idea as refreshIsraeliStocks above, for American symbols (via
// Yahoo) plus the shared USD/ILS exchange rate.
export async function refreshAmericanStocks(americanStocks, setAmericanStocks) {
  if (americanStocks.length === 0) return;

  const currentExchangeRate = await fetchExchangeRate();
  const stocksBySymbol = groupBySymbol(americanStocks);

  const updatedGroups = await Promise.all(
    Object.entries(stocksBySymbol).map(async ([stockSymbol, stocks]) => {
      try {
        const priceData = await fetchCurrentPrice(stockSymbol);
        if (priceData !== null) {
          return stocks.map((stock) => ({
            ...stock,
            currentPrice: priceData.currentPrice,
            dailyChangePercent: priceData.changePercent,
            currentExchangeRate: currentExchangeRate || stock.currentExchangeRate || stock.exchangeRate
          }));
        }
        return stocks.map((stock) => ({
          ...stock,
          currentExchangeRate: currentExchangeRate || stock.currentExchangeRate || stock.exchangeRate
        }));
      } catch (error) {
        return stocks.map((stock) => ({
          ...stock,
          currentExchangeRate: currentExchangeRate || stock.currentExchangeRate || stock.exchangeRate
        }));
      }
    })
  );

  setAmericanStocks(updatedGroups.flat());
}

export function usePriceRefresh({
  israeliStocks,
  americanStocks,
  setIsraeliStocks,
  setAmericanStocks,
  isEditMode,
  editingField,
  isAddingNewStock,
  // Fired once, the first time a full refresh cycle actually completes
  // (both branches settled) - not on raw mount, where prices are still
  // whatever was last persisted rather than freshly confirmed live. Used
  // by useAutoSnapshot.js to know it's safe to capture a snapshot value
  // without risking the "stale/incomplete render" problem that got the
  // old always-on auto-save reverted (see usePortfolioSnapshots.js).
  onFirstCycleComplete
}) {
  const hasCompletedFirstCycleRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      // Don't refresh while the user is editing or adding a stock
      if (isEditMode || editingField || isAddingNewStock) {
        return;
      }

      // Israeli (TASE scrape) and American (Yahoo) refreshes are fully
      // independent - neither's result depends on the other's - so they
      // run concurrently via Promise.allSettled instead of one being
      // awaited to completion before the other even starts. Previously the
      // Israeli branch (one sequential TASE request per unique symbol)
      // had to finish entirely before the American branch's own sequential
      // loop began, so the whole portfolio's staleness was gated by the
      // slower of the two chains run back-to-back instead of in parallel.
      // allSettled (not all) so a failure in one branch never prevents the
      // other from updating.
      Promise.allSettled([
        refreshIsraeliStocks(israeliStocks, setIsraeliStocks),
        refreshAmericanStocks(americanStocks, setAmericanStocks)
      ]).then(() => {
        if (!hasCompletedFirstCycleRef.current) {
          hasCompletedFirstCycleRef.current = true;
          if (onFirstCycleComplete) onFirstCycleComplete();
        }
      });
    }, POLLING_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [israeliStocks.length, americanStocks.length, isEditMode, isAddingNewStock]);
}
