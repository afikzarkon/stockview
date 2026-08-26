import { indexedCostBasis } from './cpiTax';

export const TAX_RATE = 0.25;

// מס רווח הון על מניה אמריקאית (נייר ערך זר): שער החליפין דולר/שקל
// משמש בדיוק כמו "מדד" עבור נייר ערך צמוד מדד - העלות בשקלים מותאמת
// לפי שינוי השער, והמס (25%) חל רק על הרווח שנשאר אחרי ההתאמה (הרווח
// הריאלי). זה מעוגן בחוק: פטור ממס על ה"סכום האינפלציוני" ברווח הון
// ממכירת נייר ערך זר (תקנות מס הכנסה, שיעור המס על רווח הון במכירת
// נייר ערך זר), כשההתאמה לניירות במטבע חוץ נעשית לפי שינוי שער המטבע
// (לא לפי מדד המחירים לצרכן).
//
// בפועל: adjustedCostBasisILS = indexedCostBasis(totalPurchaseILS, שער-קנייה, שער-היום)
//                              = totalPurchaseUSD * שער-היום
// כלומר: בדיוק שווה ערך למיסוי הרווח בדולר בלבד ואז המרתו לשקלים לפי
// שער היום - זו בדיוק הנוסחה שהייתה כאן קודם (profitUSD * currentExchangeRate),
// רק עכשיו כתובה במפורש דרך אותו מנגנון הצמדה כמו קופות גמל ומניות ישראליות,
// כדי שיהיה עקבי, ברור, וניתן לאימות.
export const calculateAmericanStockMetrics = (stock, taxRate = TAX_RATE) => {
  const totalPurchaseUSD = (stock.purchasePrice || 0) * (stock.quantity || 0);
  const totalPurchaseILS = totalPurchaseUSD * (stock.exchangeRate || 0);
  const totalCurrentValueUSD = (stock.currentPrice || 0) * (stock.quantity || 0);
  const currentExchangeRate = stock.currentExchangeRate || stock.exchangeRate || 0;
  const totalCurrentValueILS = totalCurrentValueUSD * currentExchangeRate;
  const profitUSD = totalCurrentValueUSD - totalPurchaseUSD;
  const profitILS = profitUSD * currentExchangeRate;

  // עלות מותאמת לשער החליפין (מקביל ל-indexedCostBasis של CPI) והרווח
  // הריאלי שנובע ממנה - זהו הרווח שחייב במס.
  const adjustedCostBasisILS = indexedCostBasis(totalPurchaseILS, stock.exchangeRate, currentExchangeRate);
  const realGainILS = totalCurrentValueILS - adjustedCostBasisILS;
  // הרכיב הפטור: הפרש השער על העלות המקורית - "הסכום האינפלציוני"
  // המקביל, פטור ממס לפי החוק.
  const currencyExemptGainILS = adjustedCostBasisILS - totalPurchaseILS;

  const taxILS = realGainILS > 0 ? realGainILS * taxRate : 0;
  const taxUSD = currentExchangeRate > 0 ? taxILS / currentExchangeRate : 0;
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
    adjustedCostBasisILS,
    realGainILS,
    currencyExemptGainILS,
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
// בנוסף: אם הופקד סכום בתקופה זו (lastDeposit>0), הוא נרשם כשורה חדשה
// בפנקס ההפקדות (deposits) עם תאריך משלה - lastDepositDate אם הוזן,
// אחרת updateDate, אחרת היום. הפנקס הזה הוא הבסיס לחישוב מס רווח הון
// ריאלי (ראו cpiTax.js): כל הפקדה מוצמדת בנפרד למדד לפי התאריך שלה.
//
// בסיום הפעולה lastDeposit (וה-lastDepositDate הנלווה לו) מתאפסים,
// כדי לעקוב מחדש אחר הפקדות בתקופה הבאה.
export const applyPensionCurrentValueUpdate = (pensionFund, newCurrentValue) => {
  const oldCurrentValue = pensionFund.currentValue ?? pensionFund.amount ?? 0;
  const depositThisPeriod = pensionFund.lastDeposit ?? 0;
  const adjustedPreviousValue = oldCurrentValue + depositThisPeriod;
  const updatedInitialInvestment = (pensionFund.initialInvestment ?? pensionFund.amount ?? 0) + depositThisPeriod;
  const existingDeposits = Array.isArray(pensionFund.deposits) ? pensionFund.deposits : [];
  const depositDate =
    pensionFund.lastDepositDate || pensionFund.updateDate || new Date().toISOString().slice(0, 10);
  const updatedDeposits =
    depositThisPeriod > 0
      ? [...existingDeposits, { date: depositDate, amount: depositThisPeriod }]
      : existingDeposits;

  return {
    ...pensionFund,
    currentValue: newCurrentValue,
    previousValue: adjustedPreviousValue,
    initialInvestment: updatedInitialInvestment,
    lastDeposit: 0,
    lastDepositDate: '',
    deposits: updatedDeposits,
    amount: newCurrentValue
  };
};

