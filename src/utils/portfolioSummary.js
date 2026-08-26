// Overall portfolio summary calculation.
// Extracted from App.js's calculatePortfolioSummary(). Behavior is unchanged;
// the only difference is that the stock/fund arrays are now explicit
// parameters instead of closed-over component state.

import { TAX_RATE, calculateAmericanStockMetrics } from './portfolioMath';
import { normalizeIsraeliPrice } from './formatters';

export const calculatePortfolioSummary = (
  israeliStocks,
  americanStocks,
  pensionFunds,
  cashFunds,
  bankBalances
) => {
  // Israeli stocks
  const israeliSummary = israeliStocks.reduce((acc, stock) => {
    const totalPurchase = (stock.purchasePrice || 0) * (stock.quantity || 0);
    const normalizedPrice = normalizeIsraeliPrice(stock.currentPrice);
    const totalCurrentValue = (normalizedPrice || 0) * (stock.quantity || 0);
    const profit = totalCurrentValue - totalPurchase;

    acc.totalPurchaseILS += totalPurchase;
    acc.totalCurrentValueILS += totalCurrentValue;
    acc.totalProfitILS += profit;
    acc.totalWeight += totalCurrentValue; // weight for daily-change percentage
    acc.dailyChangeSum += (stock.dailyChangePercent || 0) * totalCurrentValue;

    return acc;
  }, {
    totalPurchaseILS: 0,
    totalCurrentValueILS: 0,
    totalProfitILS: 0,
    totalWeight: 0,
    dailyChangeSum: 0
  });

  // American stocks
  const americanSummary = americanStocks.reduce((acc, stock) => {
    const metrics = calculateAmericanStockMetrics(stock);

    acc.totalPurchaseUSD += metrics.totalPurchaseUSD;
    acc.totalPurchaseILS += metrics.totalPurchaseILS;
    acc.totalCurrentValueUSD += metrics.totalCurrentValueUSD;
    acc.totalCurrentValueILS += metrics.totalCurrentValueILS;
    acc.totalProfitUSD += metrics.profitUSD;
    acc.totalProfitILS += metrics.profitILS;
    acc.totalExchangeImpact += metrics.exchangeRateImpact;
    acc.totalWeight += metrics.totalCurrentValueILS; // weight for daily-change percentage
    acc.dailyChangeSum += (stock.dailyChangePercent || 0) * metrics.totalCurrentValueILS;

    return acc;
  }, {
    totalPurchaseUSD: 0,
    totalPurchaseILS: 0,
    totalCurrentValueUSD: 0,
    totalCurrentValueILS: 0,
    totalProfitUSD: 0,
    totalProfitILS: 0,
    totalExchangeImpact: 0,
    totalWeight: 0,
    dailyChangeSum: 0
  });

  // Weighted daily-change percentage
  const totalWeight = israeliSummary.totalWeight + americanSummary.totalWeight;
  const weightedDailyChange = totalWeight > 0 ?
    (israeliSummary.dailyChangeSum + americanSummary.dailyChangeSum) / totalWeight : 0;

  // Daily profit in ILS and USD
  const dailyProfitILS = (weightedDailyChange / 100) * (israeliSummary.totalCurrentValueILS + americanSummary.totalCurrentValueILS);
  const dailyProfitUSD = (weightedDailyChange / 100) * americanSummary.totalCurrentValueUSD;

  // Daily profit split per exchange
  const israeliDailyProfitILS = israeliStocks.reduce((sum, stock) => {
    const totalCurrentValue = normalizeIsraeliPrice(stock.currentPrice) * (stock.quantity || 0);
    return sum + ((stock.dailyChangePercent || 0) / 100) * totalCurrentValue;
  }, 0);

  const americanDailyProfitUSD = americanStocks.reduce((sum, stock) => {
    const totalCurrentValueUSD = (stock.currentPrice || 0) * (stock.quantity || 0);
    return sum + ((stock.dailyChangePercent || 0) / 100) * totalCurrentValueUSD;
  }, 0);

  // Total profit percentages per exchange
  const israeliProfitILS = israeliSummary.totalCurrentValueILS - israeliSummary.totalPurchaseILS;
  const israeliTaxILS = israeliProfitILS > 0 ? israeliProfitILS * TAX_RATE : 0;
  const israeliAfterTaxILS = israeliProfitILS - israeliTaxILS;
  const israeliProfitPercent = israeliSummary.totalPurchaseILS > 0 ? (israeliProfitILS / israeliSummary.totalPurchaseILS) * 100 : 0;
  const israeliDailyPercent = israeliSummary.totalCurrentValueILS > 0 ? (israeliDailyProfitILS / israeliSummary.totalCurrentValueILS) * 100 : 0;

  const americanProfitUSD = americanSummary.totalCurrentValueUSD - americanSummary.totalPurchaseUSD;
  const americanTaxUSD = americanProfitUSD > 0 ? americanProfitUSD * TAX_RATE : 0;
  const americanAfterTaxUSD = americanProfitUSD - americanTaxUSD;
  const americanProfitPercent = americanSummary.totalPurchaseUSD > 0 ? (americanProfitUSD / americanSummary.totalPurchaseUSD) * 100 : 0;
  const americanDailyPercent = americanSummary.totalCurrentValueUSD > 0 ? (americanDailyProfitUSD / americanSummary.totalCurrentValueUSD) * 100 : 0;
  const americanTaxILS = americanSummary.totalCurrentValueUSD > 0 ? americanTaxUSD * (americanSummary.totalCurrentValueILS / americanSummary.totalCurrentValueUSD) : 0;

  // Total capital by category
  const cashFundsTotalILS = cashFunds.reduce((sum, item) => sum + (item.amount || 0), 0);
  const pensionInitialInvestmentILS = pensionFunds.reduce((sum, item) => sum + (item.initialInvestment ?? item.amount ?? 0), 0);
  const pensionCurrentValueILS = pensionFunds.reduce((sum, item) => sum + (item.currentValue ?? item.amount ?? 0), 0);
  const pensionPreviousValueILS = pensionFunds.reduce((sum, item) => sum + (item.previousValue ?? item.amount ?? 0), 0);

  // "רווח מצטבר מול הפקדות" - חלוקת הרווח הכולל בסך כל ההפקדות שבוצעו אי-פעם.
  // שים לב: זהו מדד עזר בלבד ולא תשואה אמיתית, כיוון שהפקדות מתבצעות
  // בתאריכים שונים (למשל הפקדה חודשית) ומתייחסות כאן כאילו כל הכסף
  // הופקד ביום הראשון. לכן ככל שיש הפקדות "טריות" יותר, האחוז הזה
  // מוטה כלפי מטה ואינו משקף נכון את קצב הצמיחה של הקופה.
  const pensionProfitPercent = pensionInitialInvestmentILS > 0 ? ((pensionCurrentValueILS / pensionInitialInvestmentILS) - 1) * 100 : 0;

  // תשואה מעדכון-לעדכון (השווי הקודם מול השווי הנוכחי) - זהו מדד התשואה
  // המדויק לשימוש שוטף. previousValue מתעדכן אוטומטית בכל פעם שהמשתמש
  // משנה את currentValue (ראו handleInlineEdit ב-App.js), וכולל כבר
  // בתוכו כל סכום שהוזן בשדה "הפקדה בעדכון זה" (lastDeposit) - כלומר
  // הפקדות כסף חדש מנוטרלות אוטומטית ולא "מתחזות" לרווח. לכן אין צורך
  // לחסר את ההפקדה כאן בנוסחה עצמה - זה כבר טופל בשלב השמירה.
  // רק אם אין עדיין שווי קודם (למשל קופה שנוספה זה עתה) נופלים חזרה
  // לחישוב מול ההפקדות.
  const pensionPreviousProfitPercent = pensionPreviousValueILS > 0 ? ((pensionCurrentValueILS / pensionPreviousValueILS) - 1) * 100 : (pensionInitialInvestmentILS > 0 ? ((pensionCurrentValueILS / pensionInitialInvestmentILS) - 1) * 100 : 0);
  const pensionTotalProfitILS = pensionCurrentValueILS - pensionInitialInvestmentILS;
  const pensionTaxILS = pensionTotalProfitILS > 0 ? pensionTotalProfitILS * TAX_RATE : 0;
  const pensionUpdateProfitILS = pensionCurrentValueILS - pensionPreviousValueILS;
  const totalTaxILS = israeliTaxILS + americanTaxILS + pensionTaxILS;
  const totalProfitAfterTaxILS = (israeliSummary.totalProfitILS + americanSummary.totalProfitILS + pensionTotalProfitILS) - totalTaxILS;
  const bankBalancesTotalILS = bankBalances.reduce((sum, item) => sum + (item.amount || 0), 0);
  const capitalIsraeliILS = israeliSummary.totalCurrentValueILS;
  const capitalAmericanILS = americanSummary.totalCurrentValueILS;
  const capitalTotalILS =
    capitalIsraeliILS +
    capitalAmericanILS +
    cashFundsTotalILS +
    pensionCurrentValueILS +
    bankBalancesTotalILS;

  return {
    // ILS summary
    totalPurchaseILS: israeliSummary.totalPurchaseILS + americanSummary.totalPurchaseILS + pensionInitialInvestmentILS,
    totalCurrentValueILS: israeliSummary.totalCurrentValueILS + americanSummary.totalCurrentValueILS + pensionCurrentValueILS,
    totalProfitILS: israeliSummary.totalProfitILS + americanSummary.totalProfitILS + pensionTotalProfitILS,

    // Israeli-only summary
    israeliOnlyPurchaseILS: israeliSummary.totalPurchaseILS,
    israeliOnlyCurrentValueILS: israeliSummary.totalCurrentValueILS,
    israeliOnlyProfitILS: israeliSummary.totalProfitILS,
    israeliOnlyTaxILS: israeliTaxILS,
    israeliOnlyAfterTaxILS: israeliAfterTaxILS,
    israeliOnlyProfitPercent: israeliProfitPercent,
    israeliOnlyDailyPercent: israeliDailyPercent,
    israeliOnlyDailyProfitILS: israeliDailyProfitILS,

    // USD summary
    totalPurchaseUSD: americanSummary.totalPurchaseUSD,
    totalCurrentValueUSD: americanSummary.totalCurrentValueUSD,
    totalProfitUSD: americanSummary.totalProfitUSD,
    americanOnlyTaxUSD: americanTaxUSD,
    americanOnlyTaxILS: americanTaxILS,
    americanOnlyAfterTaxUSD: americanAfterTaxUSD,
    americanOnlyProfitPercent: americanProfitPercent,
    americanOnlyDailyPercent: americanDailyPercent,
    americanOnlyDailyProfitUSD: americanDailyProfitUSD,

    // Weighted daily-change percentage
    weightedDailyChange: weightedDailyChange,

    // Daily profit in ILS and USD
    dailyProfitILS: dailyProfitILS,
    dailyProfitUSD: dailyProfitUSD,
    israeliDailyProfitILS: israeliDailyProfitILS,
    americanDailyProfitUSD: americanDailyProfitUSD,

    // Total FX impact
    totalExchangeImpact: americanSummary.totalExchangeImpact,

    // Capital breakdown
    capitalIsraeliILS,
    capitalAmericanILS,
    capitalCashFundsILS: cashFundsTotalILS,
    capitalPensionILS: pensionCurrentValueILS,
    pensionInitialInvestmentILS,
    pensionCurrentValueILS,
    pensionPreviousValueILS,
    pensionProfitPercent,
    pensionPreviousProfitPercent,
    pensionTotalProfitILS,
    pensionTaxILS,
    pensionUpdateProfitILS,
    capitalBankILS: bankBalancesTotalILS,
    capitalTotalILS,
    totalTaxILS,
    totalProfitAfterTaxILS
  };
};
