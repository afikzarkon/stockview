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

// מחזיר את סכום כל ההפקדות (מתוך פנקס ההפקדות) שבוצעו בטווח התאריכים
// (fromDateExclusive, toDateInclusive] - כלומר אחרי העדכון הקודם ועד
// (כולל) העדכון הנוכחי. אם fromDateExclusive חסר, כל ההפקדות עד
// toDateInclusive נכללות (מקרה של קופה חדשה בלי עדכון קודם).
export const sumDepositsInRange = (deposits, fromDateExclusive, toDateInclusive) => {
  if (!Array.isArray(deposits)) return 0;
  return deposits.reduce((sum, d) => {
    if (!d || !d.date) return sum;
    if (fromDateExclusive && d.date <= fromDateExclusive) return sum;
    if (toDateInclusive && d.date > toDateInclusive) return sum;
    return sum + (d.amount || 0);
  }, 0);
};

// "סוגר תקופה" לקופת גמל: השווי הנוכחי מתעדכן לערך ולתאריך החדשים
// שהמשתמש הזין, והשווי הקודם עובר לערך/לתאריך שהיו קודם. בניגוד לגרסה
// הישנה, אין יותר שדה "הפקדה בעדכון זה" ידני - הפקדות מנוהלות בנפרד
// כפנקס מתוארך (deposits), בדיוק כמו רכישות מניה. חישוב התשואה (לא
// כאן - ראו calculatePensionPeriodReturn למטה) מזהה אוטומטית לפי
// התאריכים אילו הפקדות נופלו בתוך התקופה ומנטרל אותן.
export const applyPensionValueUpdate = (pensionFund, newCurrentValue, newCurrentValueDate) => {
  const oldCurrentValue = pensionFund.currentValue ?? pensionFund.amount ?? 0;
  const oldCurrentValueDate = pensionFund.currentValueDate || '';
  return {
    ...pensionFund,
    previousValue: oldCurrentValue,
    previousValueDate: oldCurrentValueDate,
    currentValue: newCurrentValue,
    currentValueDate: newCurrentValueDate,
    amount: newCurrentValue
  };
};

// תשואת התקופה (מעדכון קודם לעדכון נוכחי), מנוטרלת אוטומטית מהפקדות
// שבוצעו בתקופה הזו: השווי הקודם "מותאם" בהוספת סכום ההפקדות שנפלו
// בין previousValueDate ל-currentValueDate, כך שהתשואה משקפת רק
// עלייה/ירידה אמיתית בשווי, לא כסף חדש שהוזרם לקופה.
export const calculatePensionPeriodReturn = (pensionFund) => {
  const currentValue = pensionFund.currentValue ?? pensionFund.amount ?? 0;
  const previousValue = pensionFund.previousValue ?? 0;
  const deposits = Array.isArray(pensionFund.deposits) ? pensionFund.deposits : [];
  const depositsInPeriod = sumDepositsInRange(deposits, pensionFund.previousValueDate, pensionFund.currentValueDate);
  const adjustedPreviousValue = previousValue + depositsInPeriod;
  const percent = adjustedPreviousValue > 0 ? ((currentValue / adjustedPreviousValue) - 1) * 100 : 0;
  return { adjustedPreviousValue, depositsInPeriod, percent };
};

