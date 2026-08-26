import { indexedCostBasis, calculateLinkedRealResult } from './cpiTax';

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
  // רווח נומינלי אמיתי בש"ח: כמה יותר/פחות שקלים יש לך בפועל היום לעומת
  // מה ששילמת - זה "כמה כסף באמת הרווחת/הפסדת", לא רק ביצועי המניה.
  // (בעבר השדה הזה חושב כ-profitUSD*currentExchangeRate, שזה בעצם
  // "הרווח הריאלי" ולא הרווח הנומינלי - ראו realGainILS למטה. זה היה
  // מטעה כשמוצג תחת התווית "רווח/הפסד" סתם, כי במקרה שהדולר נחלש
  // משמעותית זה יכול להראות "רווח" בזמן שבפועל יש הפסד נומינלי בשקלים.)
  const profitILS = totalCurrentValueILS - totalPurchaseILS;

  // עלות מותאמת לשער החליפין (מקביל ל-indexedCostBasis של CPI), והרווח/הפסד
  // הריאלי המתקבל ממנה לפי הכלל האסימטרי מפסק דין מוזס (ע"א 3555/15) -
  // ראו calculateLinkedRealResult ב-cpiTax.js להסבר המלא על 4 המקרים.
  const adjustedCostBasisILS = indexedCostBasis(totalPurchaseILS, stock.exchangeRate, currentExchangeRate);
  const { realGain: realGainILS, tax: taxILS } = calculateLinkedRealResult({
    originalCost: totalPurchaseILS,
    currentValue: totalCurrentValueILS,
    adjustedCostBasis: adjustedCostBasisILS,
    taxRate
  });
  // הפרש בין הנומינלי לריאלי - חיובי כשמדובר ב"סכום אינפלציוני" פטור,
  // שלילי כשמדובר בחלק הפסד שאינו בר-קיזוז.
  const currencyExemptGainILS = profitILS - realGainILS;

  const taxUSD = currentExchangeRate > 0 ? taxILS / currentExchangeRate : 0;
  const afterTaxUSD = profitUSD - taxUSD;
  // רווח/הפסד נומינלי אמיתי אחרי מס: כמה שקלים נשארו לך בפועל, אחרי
  // ניכוי המס שחל על הרווח הריאלי (גם אם יש הפסד נומינלי, יכול עדיין
  // לחול מס - ראו הערה למעלה).
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

