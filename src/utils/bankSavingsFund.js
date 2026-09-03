// שווי נוכחי מחושב לקופת חיסכון בבנק: בניגוד לקופת גמל (שווי מתעדכן
// ידנית), כאן הריבית שהמשתמש מזין אמורה לגדל את הכסף אוטומטית - כל
// הפקדה צומחת בריבית-דריבית שנתית (ריבית %) מתאריך ההפקדה שלה ועד
// התאריך המבוקש (בד"כ היום), ואין שדה "שווי נוכחי" נפרד לעדכן.

const MS_PER_YEAR = 1000 * 60 * 60 * 24 * 365.25;

export const yearsBetween = (fromDateStr, toDate = new Date()) => {
  const from = new Date(fromDateStr);
  const to = toDate instanceof Date ? toDate : new Date(toDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.max(0, (to - from) / MS_PER_YEAR);
};

export const computeBankSavingsFundValue = (fund, asOfDate = new Date()) => {
  const deposits = Array.isArray(fund?.deposits) ? fund.deposits : [];
  const annualRate = (fund?.interestRate || 0) / 100;
  return deposits.reduce((sum, d) => {
    const years = yearsBetween(d.date, asOfDate);
    return sum + (d.amount || 0) * Math.pow(1 + annualRate, years);
  }, 0);
};
