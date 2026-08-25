// Grouping helpers for the stock tables.
// Extracted from App.js — behavior is unchanged, only the location moved.

import { normalizeIsraeliPrice, calculateProfitPercentage } from './formatters';

// Group stocks by name (for the collapsible rows in the tables)
export const groupStocksByName = (stocks) => {
  const grouped = {};
  stocks.forEach(stock => {
    if (!grouped[stock.stockName]) {
      grouped[stock.stockName] = [];
    }
    grouped[stock.stockName].push(stock);
  });
  return grouped;
};

// Summary numbers for a group of stocks sharing the same name
export const calculateGroupSummary = (stocks) => {
  const totalQuantity = stocks.reduce((sum, stock) => sum + (stock.quantity || 0), 0);
  const totalPurchaseValue = stocks.reduce((sum, stock) => {
    const purchaseValue = (stock.purchasePrice || 0) * (stock.quantity || 0);
    return sum + purchaseValue;
  }, 0);
  const totalCurrentValue = stocks.reduce((sum, stock) => {
    const normalizedPrice = normalizeIsraeliPrice(stock.currentPrice);
    const currentValue = (normalizedPrice || 0) * (stock.quantity || 0);
    return sum + currentValue;
  }, 0);
  const totalProfit = totalCurrentValue - totalPurchaseValue;
  const profitPercentage = calculateProfitPercentage(totalPurchaseValue, totalCurrentValue);

  // Quantity-weighted average price
  const averagePurchasePrice = totalQuantity > 0 ? totalPurchaseValue / totalQuantity : 0;
  const averageCurrentPrice = totalQuantity > 0 ? totalCurrentValue / totalQuantity : 0;

  return {
    totalQuantity,
    totalPurchaseValue,
    totalCurrentValue,
    totalProfit,
    profitPercentage,
    averagePurchasePrice,
    averageCurrentPrice
  };
};
