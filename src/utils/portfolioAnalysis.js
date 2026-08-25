// Portfolio analysis calculation (distributions, top/worst performers, etc.).
// Extracted from App.js's calculatePortfolioAnalysis(). Behavior is unchanged;
// the only difference is that the stock/fund arrays are now explicit
// parameters instead of closed-over component state.

import { calculateAmericanStockMetrics } from './portfolioMath';
import { normalizeIsraeliPrice, toNum } from './formatters';

export const calculatePortfolioAnalysis = (
  israeliStocks,
  americanStocks,
  pensionFunds,
  cashFunds,
  bankBalances
) => {
  const now = new Date();
  const daysBetween = (rawDate) => {
    const d = new Date(rawDate);
    if (Number.isNaN(d.getTime())) return 0;
    const days = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    return Math.max(days, 0);
  };

  // Distribution by exchange
  const israeliTotalValue = israeliStocks.reduce((sum, stock) => {
    const normalizedPrice = normalizeIsraeliPrice(stock.currentPrice);
    return sum + (toNum(normalizedPrice) * toNum(stock.quantity));
  }, 0);

  const americanTotalValueILS = americanStocks.reduce((sum, stock) => {
    const metrics = calculateAmericanStockMetrics(stock);
    return sum + metrics.totalCurrentValueILS;
  }, 0);

  const pensionTotalValueILS = pensionFunds.reduce(
    (sum, item) => sum + toNum(item.currentValue != null ? item.currentValue : item.amount),
    0
  );
  const cashFundsTotalValueILS = cashFunds.reduce((sum, item) => sum + toNum(item.amount), 0);
  const bankTotalValueILS = bankBalances.reduce((sum, item) => sum + toNum(item.amount), 0);
  const totalValueILS =
    israeliTotalValue +
    americanTotalValueILS +
    pensionTotalValueILS +
    cashFundsTotalValueILS +
    bankTotalValueILS;

  // Distribution by stock
  const stockDistribution = {};

  const newDistributionEntry = (exchange) => ({
    name: '',
    value: 0,
    percentage: 0,
    exchange,
    profit: 0,
    profitPercentage: 0,
    totalQuantity: 0,
    avgPurchasePrice: 0,
    totalPurchaseValue: 0,
    totalWeightForYears: 0,
    weightedYearsNumerator: 0,
    daysHeld: 0,
    yearsHeld: 0,
    annualizedReturn: 0,
    dailyChange: 0,
    volatility: 0
  });

  // Israeli stocks
  israeliStocks.forEach(stock => {
    const value = toNum(normalizeIsraeliPrice(stock.currentPrice)) * toNum(stock.quantity);
    const purchaseValue = toNum(stock.purchasePrice) * toNum(stock.quantity);
    const profit = value - purchaseValue;

    const daysHeld = daysBetween(stock.purchaseDate);
    const yearsHeld = daysHeld / 365;

    if (!stockDistribution[stock.stockName]) {
      stockDistribution[stock.stockName] = { ...newDistributionEntry('israeli'), name: stock.stockName };
    }

    stockDistribution[stock.stockName].value += value;
    stockDistribution[stock.stockName].profit += profit;
    stockDistribution[stock.stockName].totalQuantity += toNum(stock.quantity);
    stockDistribution[stock.stockName].totalPurchaseValue += purchaseValue;
    stockDistribution[stock.stockName].totalWeightForYears += purchaseValue;
    stockDistribution[stock.stockName].weightedYearsNumerator += yearsHeld * purchaseValue;
    stockDistribution[stock.stockName].daysHeld = Math.max(stockDistribution[stock.stockName].daysHeld, daysHeld);
    stockDistribution[stock.stockName].yearsHeld = Math.max(stockDistribution[stock.stockName].yearsHeld, yearsHeld);
    stockDistribution[stock.stockName].dailyChange = toNum(stock.dailyChangePercent);

    if (yearsHeld > 0 && purchaseValue > 0) {
      const annualizedReturn = Math.pow((value / purchaseValue), (1 / yearsHeld)) - 1;
      stockDistribution[stock.stockName].annualizedReturn = annualizedReturn;
    }
  });

  // American stocks
  americanStocks.forEach(stock => {
    const metrics = calculateAmericanStockMetrics(stock);
    const value = metrics.totalCurrentValueILS;
    const purchaseValue = metrics.totalPurchaseILS;
    const profit = metrics.profitILS;

    const daysHeld = daysBetween(stock.purchaseDate);
    const yearsHeld = daysHeld / 365;

    if (!stockDistribution[stock.stockName]) {
      stockDistribution[stock.stockName] = { ...newDistributionEntry('american'), name: stock.stockName };
    }

    stockDistribution[stock.stockName].value += value;
    stockDistribution[stock.stockName].profit += profit;
    stockDistribution[stock.stockName].totalQuantity += toNum(stock.quantity);
    stockDistribution[stock.stockName].totalPurchaseValue += purchaseValue;
    stockDistribution[stock.stockName].totalWeightForYears += purchaseValue;
    stockDistribution[stock.stockName].weightedYearsNumerator += yearsHeld * purchaseValue;
    stockDistribution[stock.stockName].daysHeld = Math.max(stockDistribution[stock.stockName].daysHeld, daysHeld);
    stockDistribution[stock.stockName].yearsHeld = Math.max(stockDistribution[stock.stockName].yearsHeld, yearsHeld);
    stockDistribution[stock.stockName].dailyChange = toNum(stock.dailyChangePercent);

    if (yearsHeld > 0 && purchaseValue > 0) {
      const annualizedReturn = Math.pow((value / purchaseValue), (1 / yearsHeld)) - 1;
      stockDistribution[stock.stockName].annualizedReturn = annualizedReturn;
    }
  });

  // Derived per-stock figures
  Object.values(stockDistribution).forEach(stock => {
    stock.percentage = totalValueILS > 0 ? (stock.value / totalValueILS) * 100 : 0;
    stock.profitPercentage = stock.totalPurchaseValue > 0 ? (stock.profit / stock.totalPurchaseValue) * 100 : 0;
    stock.avgPurchasePrice = stock.totalQuantity > 0 ? stock.totalPurchaseValue / stock.totalQuantity : 0;
    stock.yearsHeld = stock.totalWeightForYears > 0
      ? stock.weightedYearsNumerator / stock.totalWeightForYears
      : stock.yearsHeld;
    stock.daysHeld = Math.round(stock.yearsHeld * 365);

    if (stock.yearsHeld > 0 && stock.totalPurchaseValue > 0) {
      stock.annualizedReturn = Math.pow((stock.value / stock.totalPurchaseValue), (1 / stock.yearsHeld)) - 1;
    }

    // Simplistic volatility approximation
    stock.volatility = Math.abs(stock.dailyChange) * 1.5;
  });

  // Distribution by purchase date
  const monthlyDistribution = {};
  const yearlyDistribution = {};

  const addDateBucket = (stock, value) => {
    const date = new Date(stock.purchaseDate);
    if (Number.isNaN(date.getTime())) return;
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const year = date.getFullYear();
    if (!monthlyDistribution[month]) {
      monthlyDistribution[month] = { value: 0, count: 0 };
    }
    monthlyDistribution[month].value += value;
    monthlyDistribution[month].count += 1;

    if (!yearlyDistribution[year]) {
      yearlyDistribution[year] = { value: 0, count: 0 };
    }
    yearlyDistribution[year].value += value;
    yearlyDistribution[year].count += 1;
  };

  israeliStocks.forEach((stock) => {
    const value = toNum(normalizeIsraeliPrice(stock.currentPrice)) * toNum(stock.quantity);
    addDateBucket(stock, value);
  });
  americanStocks.forEach((stock) => {
    const metrics = calculateAmericanStockMetrics(stock);
    addDateBucket(stock, metrics.totalCurrentValueILS);
  });
  pensionFunds.forEach((item) => {
    const value = toNum(item.currentValue != null ? item.currentValue : item.amount);
    addDateBucket({ purchaseDate: item.updateDate }, value);
  });
  cashFunds.forEach((item) => {
    addDateBucket({ purchaseDate: item.updateDate }, toNum(item.amount));
  });
  bankBalances.forEach((item) => {
    addDateBucket({ purchaseDate: item.updateDate }, toNum(item.amount));
  });

  const stockList = Object.values(stockDistribution);

  // Detailed reports
  const topPerformers = [...stockList]
    .filter((s) => s.profit > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 5);

  const worstPerformers = [...stockList]
    .filter((s) => s.profit < 0)
    .sort((a, b) => a.profit - b.profit)
    .slice(0, 5);

  const largestPositions = [...stockList]
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const totalPurchaseILS = stockList.reduce((sum, stock) => sum + stock.totalPurchaseValue, 0);
  const totalProfitILS = stockList.reduce((sum, stock) => sum + stock.profit, 0);
  const weightedDailyChangePercent = totalValueILS > 0
    ? stockList.reduce((sum, stock) => sum + (stock.dailyChange * stock.value), 0) / totalValueILS
    : 0;
  const weightedAnnualizedReturnPercent = totalPurchaseILS > 0
    ? stockList.reduce((sum, stock) => sum + ((stock.annualizedReturn || 0) * stock.totalPurchaseValue), 0) /
      totalPurchaseILS * 100
    : 0;
  const concentrationTop3Percent = stockList
    .slice()
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .reduce((sum, stock) => sum + stock.percentage, 0);
  const averageHoldingDays = stockList.length
    ? Math.round(stockList.reduce((sum, stock) => sum + stock.daysHeld, 0) / stockList.length)
    : 0;
  const americanFxImpactILS = americanStocks.reduce((sum, stock) => {
    const metrics = calculateAmericanStockMetrics(stock);
    return sum + metrics.exchangeRateImpact;
  }, 0);
  const israeliPositions = stockList.filter((s) => s.exchange === 'israeli').length;
  const americanPositions = stockList.filter((s) => s.exchange === 'american').length;
  const nonStockTotalValueILS =
    pensionTotalValueILS + cashFundsTotalValueILS + bankTotalValueILS;

  return {
    // Distribution by exchange
    exchangeDistribution: {
      israeli: {
        value: israeliTotalValue,
        percentage: totalValueILS > 0 ? (israeliTotalValue / totalValueILS) * 100 : 0
      },
      american: {
        value: americanTotalValueILS,
        percentage: totalValueILS > 0 ? (americanTotalValueILS / totalValueILS) * 100 : 0
      },
      pension: {
        value: pensionTotalValueILS,
        percentage: totalValueILS > 0 ? (pensionTotalValueILS / totalValueILS) * 100 : 0
      },
      cashFunds: {
        value: cashFundsTotalValueILS,
        percentage: totalValueILS > 0 ? (cashFundsTotalValueILS / totalValueILS) * 100 : 0
      },
      bank: {
        value: bankTotalValueILS,
        percentage: totalValueILS > 0 ? (bankTotalValueILS / totalValueILS) * 100 : 0
      },
      total: totalValueILS
    },

    // Distribution by stock
    stockDistribution: [...stockList].sort((a, b) => b.value - a.value),

    // Distribution by date
    monthlyDistribution: Object.entries(monthlyDistribution)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data })),

    yearlyDistribution: Object.entries(yearlyDistribution)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, data]) => ({ year, ...data })),

    // Detailed reports
    reports: {
      topPerformers,
      worstPerformers,
      largestPositions
    },
    summaryMetrics: {
      positionsCount:
        stockList.length + pensionFunds.length + cashFunds.length + bankBalances.length,
      israeliPositions,
      americanPositions,
      pensionPositions: pensionFunds.length,
      cashFundsPositions: cashFunds.length,
      bankPositions: bankBalances.length,
      totalPurchaseILS,
      totalProfitILS,
      weightedDailyChangePercent,
      weightedAnnualizedReturnPercent,
      concentrationTop3Percent,
      averageHoldingDays,
      americanFxImpactILS,
      pensionTotalValueILS,
      cashFundsTotalValueILS,
      bankTotalValueILS,
      nonStockTotalValueILS,
      overallTotalValueILS: totalValueILS
    }
  };
};
