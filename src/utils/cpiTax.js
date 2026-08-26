// חישובי מס רווח הון "ריאלי" המבוססים על הצמדה למדד המחירים לצרכן.
//
// עקרון: כשנכס (מניה, או הפקדה לקופת גמל) צמוד למדד, "העלות המותאמת"
// שלו = העלות המקורית * (מדד עדכני / מדד ביום הרכישה/ההפקדה).
// הרווח הריאלי = השווי הנוכחי פחות העלות המותאמת. מס רווח הון (25%)
// חל רק על הרווח הריאלי, כי חלק מהעלייה הנומינלית במחיר היא רק
// פיצוי על אינפלציה ולא רווח אמיתי.
//
// לקופות גמל שאינן מוצמדות למדד: מס שטוח על מלוא הרווח הנומינלי,
// בלי הצמדה כלל, לפי החלטת המשתמש.
//
// שים לב: אלו נוסחאות לפי המפרט שנמסר על ידי המשתמש. זו אינה ייעוץ מס,
// ומומלץ לוודא מול רואה חשבון שהנוסחאות תואמות את המצב האישי.

export const STOCK_REAL_GAIN_TAX_RATE = 0.25;
export const PENSION_LINKED_REAL_GAIN_TAX_RATE = 0.25;
export const PENSION_UNLINKED_NOMINAL_TAX_RATE = 0.15;

// "מפתח החודש" (YYYY-MM) של תאריך נתון - כי מדד המחירים לצרכן מתפרסם
// ברזולוציה חודשית, ולכן החיפוש שלו תמיד לפי חודש ולא לפי יום מדויק.
export const monthKeyFromDate = (dateStr) => {
  if (!dateStr) return null;
  return String(dateStr).slice(0, 7); // "2024-03-15" -> "2024-03"
};

// עלות מותאמת למדד: עלות מקורית * (מדד עדכני / מדד בתאריך הבסיס).
// אם אין מדד בסיס תקין (0/undefined), מחזירים את העלות המקורית ללא הצמדה
// (fail-safe: עדיף מס גבוה מדי-מעט מאשר קריסה של המסך).
export const indexedCostBasis = (originalCost, indexAtCost, currentIndex) => {
  if (!indexAtCost || indexAtCost <= 0 || !currentIndex) return originalCost;
  return originalCost * (currentIndex / indexAtCost);
};

// מס רווח הון ריאלי על אחזקת מניה בודדת (lot יחיד עם תאריך קנייה יחיד).
export const calculateStockRealGainTax = ({
  purchasePrice,
  quantity,
  currentValue,
  indexAtPurchase,
  currentIndex,
  taxRate = STOCK_REAL_GAIN_TAX_RATE
}) => {
  const originalCost = (purchasePrice || 0) * (quantity || 0);
  const adjustedCost = indexedCostBasis(originalCost, indexAtPurchase, currentIndex);
  const realGain = currentValue - adjustedCost;
  const tax = realGain > 0 ? realGain * taxRate : 0;
  return { originalCost, adjustedCost, realGain, tax };
};

// מס רווח הון על קופת גמל, מבוסס על "פנקס הפקדות" מלא:
// deposits = [{ date: 'YYYY-MM-DD', amount: number }, ...]
//
// אם isLinkedToIndex=true: כל הפקדה מוצמדת בנפרד למדד לפי חודש ההפקדה
// שלה (indexByMonth), והמס חל על סך הרווח הריאלי מול העלות המותאמת.
// אם isLinkedToIndex=false: מס שטוח על סך הרווח הנומינלי, בלי הצמדה.
//
// indexByMonth: מיפוי "YYYY-MM" -> ערך מדד, לכל החודשים הרלוונטיים.
// אם חסר ערך מדד לחודש מסוים, ההפקדה של אותו חודש לא תוצמד (fail-safe).
export const calculatePensionRealGainTax = ({
  deposits = [],
  currentValue,
  isLinkedToIndex,
  currentIndex,
  indexByMonth = {},
  linkedTaxRate = PENSION_LINKED_REAL_GAIN_TAX_RATE,
  unlinkedTaxRate = PENSION_UNLINKED_NOMINAL_TAX_RATE
}) => {
  const totalDeposited = deposits.reduce((sum, d) => sum + (d.amount || 0), 0);

  if (!isLinkedToIndex) {
    const nominalGain = currentValue - totalDeposited;
    const tax = nominalGain > 0 ? nominalGain * unlinkedTaxRate : 0;
    return { totalDeposited, adjustedCostBasis: totalDeposited, gain: nominalGain, tax, mode: 'nominal' };
  }

  const adjustedCostBasis = deposits.reduce((sum, d) => {
    const depositIndex = indexByMonth[monthKeyFromDate(d.date)];
    return sum + indexedCostBasis(d.amount || 0, depositIndex, currentIndex);
  }, 0);
  const realGain = currentValue - adjustedCostBasis;
  const tax = realGain > 0 ? realGain * linkedTaxRate : 0;
  return { totalDeposited, adjustedCostBasis, gain: realGain, tax, mode: 'real' };
};
