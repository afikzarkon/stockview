export const TAX_RATE = 0.25;

export const calculateAmericanStockMetrics = (stock, taxRate = TAX_RATE) => {
  const totalPurchaseUSD = (stock.purchasePrice || 0) * (stock.quantity || 0);
  const totalPurchaseILS = totalPurchaseUSD * (stock.exchangeRate || 0);
  const totalCurrentValueUSD = (stock.currentPrice || 0) * (stock.quantity || 0);
  const currentExchangeRate = stock.currentExchangeRate || stock.exchangeRate || 0;
  const totalCurrentValueILS = totalCurrentValueUSD * currentExchangeRate;
  const profitUSD = totalCurrentValueUSD - totalPurchaseUSD;
  const profitILS = profitUSD * currentExchangeRate;
  const taxUSD = profitUSD > 0 ? profitUSD * taxRate : 0;
  const taxILS = taxUSD * currentExchangeRate;
  const afterTaxUSD = profitUSD - taxUSD;
  const afterTaxILS = profitILS - taxILS;
  // FX impact is measured on today's position value in USD:
  // (current stock price * quantity * current USDILS) - (current stock price * quantity * buy USDILS)
  const exchangeRateImpact = totalCurrentValueUSD * (currentExchangeRate - (stock.exchangeRate || 0));

  return {
    totalPurchaseUSD,
    totalPurchaseILS,
    totalCurrentValueUSD,
    currentExchangeRate,
    totalCurrentValueILS,
    profitUSD,
    profitILS,
    taxUSD,
    taxILS,
    afterTaxUSD,
    afterTaxILS,
    exchangeRateImpact
  };
};

// קריאה לפונקציה הזו מבצעת "סגירת תקופה" לקופת גמל אחת: השווי הנוכחי
// מתעדכן לערך החדש שהמשתמש הזין, השווי הקודם (previousValue) עובר לערך
// שהיה קודם ומצטרף אליו כל סכום שהוזן בשדה "הפקדה בעדכון זה" (lastDeposit),
// וסך ההפקדות המצטבר (initialInvestment) גדל באותו סכום.
//
// למה זה נחוץ: בלי הצעד הזה, תשואה שמחושבת פשוט כ-(currentValue/previousValue-1)
// הייתה סופרת הפקדות כסף חדש כאילו הן רווח מהשוק. על ידי "הזזת" ההפקדה
// לתוך ה-baseline (previousValue) עצמו, התשואה שתחושב בפעם הבאה משקפת רק
// עלייה/ירידה אמיתית בשווי, לא כסף חדש שהוזרם לקופה.
//
// בסיום הפעולה lastDeposit מתאפס, כדי לעקוב מחדש אחר הפקדות בתקופה הבאה.
export const applyPensionCurrentValueUpdate = (pensionFund, newCurrentValue) => {
  const oldCurrentValue = pensionFund.currentValue ?? pensionFund.amount ?? 0;
  const depositThisPeriod = pensionFund.lastDeposit ?? 0;
  const adjustedPreviousValue = oldCurrentValue + depositThisPeriod;
  const updatedInitialInvestment = (pensionFund.initialInvestment ?? pensionFund.amount ?? 0) + depositThisPeriod;

  return {
    ...pensionFund,
    currentValue: newCurrentValue,
    previousValue: adjustedPreviousValue,
    initialInvestment: updatedInitialInvestment,
    lastDeposit: 0,
    amount: newCurrentValue
  };
};

