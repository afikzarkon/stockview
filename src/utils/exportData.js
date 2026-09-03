// Row-shaping for portfolio export (Excel/PDF) - pure functions, no library
// calls, so they're independently testable and reusable for both formats.
// Reuses the exact same calculations already used in each table's display
// (normalizeIsraeliPrice, calculateAmericanStockMetrics,
// calculatePensionPeriodReturn) rather than recomputing totals a different
// way, to avoid a repeat of the currency-unit bugs (אגורות/₪) that already
// happened more than once in this project.
import { normalizeIsraeliPrice } from './formatters';
import { calculateAmericanStockMetrics, calculatePensionPeriodReturn } from './portfolioMath';
import { computeBankSavingsFundValue } from './bankSavingsFund';

const round2 = (n) => Math.round((n || 0) * 100) / 100;

export const buildIsraeliStocksExportRows = (israeliStocks) =>
  (israeliStocks || []).map((stock) => {
    const currentPrice = normalizeIsraeliPrice(stock.currentPrice);
    const totalPurchase = (stock.purchasePrice || 0) * (stock.quantity || 0);
    const totalCurrentValue = (currentPrice || 0) * (stock.quantity || 0);
    return {
      'שם מנייה': stock.stockName || '',
      'תאריך קנייה': stock.purchaseDate || '',
      'מחיר קנייה (₪)': stock.purchasePrice || 0,
      'כמות': stock.quantity || 0,
      'מחיר נוכחי (₪)': round2(currentPrice),
      'סה"כ רכישה (₪)': round2(totalPurchase),
      'סה"כ שווי נוכחי (₪)': round2(totalCurrentValue),
      'רווח/הפסד (₪)': round2(totalCurrentValue - totalPurchase)
    };
  });

export const buildAmericanStocksExportRows = (americanStocks) =>
  (americanStocks || []).map((stock) => {
    const m = calculateAmericanStockMetrics(stock);
    return {
      'שם מנייה': stock.stockName || '',
      'תאריך קנייה': stock.purchaseDate || '',
      'מחיר קנייה ($)': stock.purchasePrice || 0,
      'כמות': stock.quantity || 0,
      'מחיר נוכחי ($)': stock.currentPrice || 0,
      'שער חליפין נוכחי': stock.currentExchangeRate || stock.exchangeRate || 0,
      'סה"כ שווי נוכחי ($)': round2(m.totalCurrentValueUSD),
      'סה"כ שווי נוכחי (₪)': round2(m.totalCurrentValueILS),
      'רווח/הפסד ($)': round2(m.profitUSD),
      'רווח/הפסד (₪)': round2(m.profitILS)
    };
  });

export const buildPensionFundsExportRows = (pensionFunds) =>
  (pensionFunds || []).map((fund) => {
    const currentValue = fund.currentValue ?? fund.amount ?? 0;
    const periodReturn = calculatePensionPeriodReturn(fund);
    return {
      'שם קופה': fund.fundName || '',
      'שווי נוכחי (₪)': round2(currentValue),
      'תאריך שווי נוכחי': fund.currentValueDate || '',
      'שווי קודם (₪)': round2(fund.previousValue || 0),
      'תשואת תקופה (%)': fund.previousValue ? round2(periodReturn.percent) : ''
    };
  });

export const buildCashFundsExportRows = (cashFunds) =>
  (cashFunds || []).map((fund) => ({
    'שם קרן': fund.fundName || '',
    'מספר נייר': fund.securityId || '',
    'תאריך עדכון': fund.updateDate || '',
    'סכום (₪)': round2(fund.amount || 0)
  }));

export const buildBankBalancesExportRows = (bankBalances) =>
  (bankBalances || []).map((balance) => ({
    'תאריך עדכון': balance.updateDate || '',
    'יתרה (₪)': round2(balance.amount || 0)
  }));

export const buildBankSavingsFundsExportRows = (bankSavingsFunds) =>
  (bankSavingsFunds || []).map((fund) => {
    const deposits = Array.isArray(fund.deposits) ? fund.deposits : [];
    const totalDeposited = deposits.reduce((sum, d) => sum + (d.amount || 0), 0);
    const currentValue = computeBankSavingsFundValue(fund);
    return {
      'שם': fund.fundName || '',
      'מסלול השקעה': fund.investmentTrack || '',
      'ריבית (%)': fund.interestRate || 0,
      'צמוד למדד': fund.isLinkedToIndex ? 'כן' : 'לא',
      'סך הפקדות (₪)': round2(totalDeposited),
      'שווי נוכחי (₪)': round2(currentValue),
      'רווח/הפסד (₪)': round2(currentValue - totalDeposited)
    };
  });

// A compact list of the headline totals from calculatePortfolioSummary
// (portfolioSummary.js) - field names match that module's return shape
// directly rather than remapping every field, since it already has many.
export const buildSummaryExportRows = (summary) => {
  if (!summary) return [];
  return [
    { 'מדד': 'סה"כ שווי תיק (₪)', 'ערך': round2(summary.totalCurrentValueILS) },
    { 'מדד': 'סה"כ השקעה (₪)', 'ערך': round2(summary.totalPurchaseILS) },
    { 'מדד': 'סה"כ רווח/הפסד (₪)', 'ערך': round2(summary.totalProfitILS) },
    { 'מדד': 'שינוי יומי משוקלל (%)', 'ערך': round2(summary.weightedDailyChange) },
    { 'מדד': 'רווח/הפסד יומי (₪)', 'ערך': round2(summary.dailyProfitILS) }
  ];
};
