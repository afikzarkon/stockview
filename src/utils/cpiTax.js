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

// מיישם את הכלל האסימטרי מפסק דין מוזס (ע"א 3555/15, 3723/15, 5447/16)
// לחישוב "רווח/הפסד ריאלי" כשיש הצמדה (למדד או לשער מטבע). הכלל אינו
// "רווח נוכחי פחות עלות מותאמת" בפשטות - הוא תלוי בכיוון ההצמדה ובסימן
// התוצאה הנומינלית, לפי 4 מקרים:
//
// 1. הצמדה כלפי מעלה (מדד/שער עלה) + רווח נומינלי:
//    "סכום אינפלציוני" פטור = min(רכיב ההצמדה, הרווח הנומינלי) - לא
//    יכול לעלות על הרווח עצמו (הרווח הריאלי אף פעם לא יורד מתחת ל-0
//    כתוצאה מהצמדה קיצונית, גם אם ההצמדה התיאורטית עולה על הרווח).
// 2. הצמדה כלפי מעלה + הפסד נומינלי:
//    אין "סכום אינפלציוני" כלל - לפי לשון החוק הוא מוגדר רק כחלק
//    מרווח הון. ההפסד הנומינלי המלא מוכר, בלי הגדלה (נדחתה בפסק הדין
//    טענת נישום שרצה "להגדיל" הפסד לפי הצמדה נוחה).
// 3. הצמדה כלפי מטה (מדד/שער ירד) + רווח נומינלי:
//    אין הקלה - כל הרווח הנומינלי חייב במס. ירידת מדד/שער לא "מקטינה"
//    רווח חייב.
// 4. הצמדה כלפי מטה + הפסד נומינלי:
//    החלק בהפסד הנובע מירידת המדד/השער אינו ניתן לקיזוז - ההפסד
//    המוכר (בר-הקיזוז) הוא currentValue - adjustedCostBasis, קטן
//    בגודלו (המוחלט) מההפסד הנומינלי המלא.
//
// שים לב: אלו נוסחאות המבוססות על פסיקה קיימת, לא ייעוץ מס אישי -
// מומלץ לוודא מול רואה חשבון.
export const calculateLinkedRealResult = ({ originalCost, currentValue, adjustedCostBasis, taxRate = 0.25 }) => {
  const nominalGain = currentValue - originalCost;
  const linkageComponent = adjustedCostBasis - originalCost; // + אם הוצמד כלפי מעלה, - אם כלפי מטה

  let realGain;
  let exemptAmount = 0;        // "סכום אינפלציוני" פטור - רלוונטי רק ברווח + הצמדה כלפי מעלה
  let nonDeductibleAmount = 0; // גודל ההפסד שאינו בר-קיזוז - רלוונטי רק בהפסד + הצמדה כלפי מטה

  if (linkageComponent >= 0) {
    if (nominalGain >= 0) {
      exemptAmount = Math.min(linkageComponent, nominalGain);
      realGain = nominalGain - exemptAmount;
    } else {
      realGain = nominalGain; // הפסד: מוכר במלואו, ללא הגדלה
    }
  } else {
    if (nominalGain >= 0) {
      realGain = nominalGain; // רווח: חייב במלואו, ללא הקלה
    } else {
      realGain = currentValue - adjustedCostBasis; // הפסד: מוכר חלקית בלבד
      nonDeductibleAmount = nominalGain - realGain; // שלילי - הגודל שאבד מהקיזוז
    }
  }

  const tax = realGain > 0 ? realGain * taxRate : 0;

  return { nominalGain, realGain, exemptAmount, nonDeductibleAmount, tax };
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
  const { realGain, tax } = calculateLinkedRealResult({ originalCost, currentValue, adjustedCostBasis: adjustedCost, taxRate });
  return { originalCost, adjustedCost, realGain, tax };
};

// מס רווח הון על קופת גמל, מבוסס על "פנקס הפקדות" מלא:
// deposits = [{ date: 'YYYY-MM-DD', amount: number }, ...]
//
// אם isLinkedToIndex=true: כל הפקדה מוצמדת בנפרד למדד לפי חודש ההפקדה
// שלה (indexByMonth), ואז מיושם הכלל האסימטרי (calculateLinkedRealResult)
// ברמת הקופה כולה (סך ההפקדות מול סך העלות המותאמת).
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
  const { realGain, tax } = calculateLinkedRealResult({
    originalCost: totalDeposited,
    currentValue,
    adjustedCostBasis,
    taxRate: linkedTaxRate
  });
  return { totalDeposited, adjustedCostBasis, gain: realGain, tax, mode: 'real' };
};
