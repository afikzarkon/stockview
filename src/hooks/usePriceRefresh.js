// Automatic price refresh: polls TASE/Yahoo prices every 10s and updates
// the stock arrays, unless the user is mid-edit or mid-add.
// Extracted from App.js — behavior is unchanged, only the location moved.

import { useEffect } from 'react';
import { fetchCurrentPrice, fetchExchangeRate, fetchIsraeliStockPrice } from '../api/stockPrices';

const POLLING_INTERVAL_MS = 10000;

export function usePriceRefresh({
  israeliStocks,
  americanStocks,
  setIsraeliStocks,
  setAmericanStocks,
  isEditMode,
  editingField,
  isAddingNewStock
}) {
  useEffect(() => {
    const interval = setInterval(async () => {
      // Don't refresh while the user is editing or adding a stock
      if (isEditMode || editingField || isAddingNewStock) {
        return;
      }

      // Refresh Israeli stocks
      if (israeliStocks.length > 0) {
        // Group by name (ID) so we only request each stock once
        const stocksBySymbol = {};
        israeliStocks.forEach(stock => {
          if (!stocksBySymbol[stock.stockName]) {
            stocksBySymbol[stock.stockName] = [];
          }
          stocksBySymbol[stock.stockName].push(stock);
        });

        const updatedIsraeliStocks = [];

        for (const [stockSymbol, stocks] of Object.entries(stocksBySymbol)) {
          const priceData = await fetchIsraeliStockPrice(stockSymbol);

          if (priceData && priceData.currentPrice !== null) {
            // Convert from agorot to shekels
            const normalizedPrice = priceData.currentPrice / 100;

            stocks.forEach(stock => {
              updatedIsraeliStocks.push({
                ...stock,
                currentPrice: normalizedPrice,
                dailyChangePercent: priceData.changePercent
              });
            });
          } else {
            // No price returned — keep the existing data
            stocks.forEach(stock => {
              updatedIsraeliStocks.push(stock);
            });
          }
        }

        setIsraeliStocks(updatedIsraeliStocks);
      }

      // Refresh American stocks
      if (americanStocks.length > 0) {
        const currentExchangeRate = await fetchExchangeRate();

        const stocksBySymbol = {};
        americanStocks.forEach(stock => {
          if (!stocksBySymbol[stock.stockName]) {
            stocksBySymbol[stock.stockName] = [];
          }
          stocksBySymbol[stock.stockName].push(stock);
        });

        const updatedAmericanStocks = [];

        for (const [stockSymbol, stocks] of Object.entries(stocksBySymbol)) {
          try {
            const priceData = await fetchCurrentPrice(stockSymbol);
            if (priceData !== null) {
              stocks.forEach(stock => {
                updatedAmericanStocks.push({
                  ...stock,
                  currentPrice: priceData.currentPrice,
                  dailyChangePercent: priceData.changePercent,
                  currentExchangeRate: currentExchangeRate || stock.currentExchangeRate || stock.exchangeRate
                });
              });
            } else {
              stocks.forEach(stock => {
                updatedAmericanStocks.push({
                  ...stock,
                  currentExchangeRate: currentExchangeRate || stock.currentExchangeRate || stock.exchangeRate
                });
              });
            }
          } catch (error) {
            stocks.forEach(stock => {
              updatedAmericanStocks.push({
                ...stock,
                currentExchangeRate: currentExchangeRate || stock.currentExchangeRate || stock.exchangeRate
              });
            });
          }
        }

        setAmericanStocks(updatedAmericanStocks);
      }
    }, POLLING_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [israeliStocks.length, americanStocks.length, isEditMode, isAddingNewStock]);
}
