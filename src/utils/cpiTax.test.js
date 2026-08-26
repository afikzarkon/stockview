import {
  indexedCostBasis,
  monthKeyFromDate,
  calculateStockRealGainTax,
  calculatePensionRealGainTax,
  calculateLinkedRealResult
} from './cpiTax';

describe('monthKeyFromDate', () => {
  test('truncates a date string to YYYY-MM', () => {
    expect(monthKeyFromDate('2024-03-15')).toBe('2024-03');
  });
  test('returns null for missing dates', () => {
    expect(monthKeyFromDate(null)).toBeNull();
    expect(monthKeyFromDate(undefined)).toBeNull();
  });
});

describe('indexedCostBasis', () => {
  test('scales cost by the ratio between current and base index', () => {
    // מדד עלה מ-100 ל-110 (10% אינפלציה) -> עלות מותאמת גדלה ב-10%
    expect(indexedCostBasis(1000, 100, 110)).toBe(1100);
  });
  test('falls back to the original cost when the base index is missing/invalid', () => {
    expect(indexedCostBasis(1000, 0, 110)).toBe(1000);
    expect(indexedCostBasis(1000, null, 110)).toBe(1000);
    expect(indexedCostBasis(1000, 100, null)).toBe(1000);
  });
});

describe('calculateStockRealGainTax', () => {
  test('taxes only the real (inflation-adjusted) gain, not the full nominal gain', () => {
    // קניתי ב-100 מדד=100, שווי היום=1300 מדד=130 (30% אינפלציה)
    // עלות מותאמת = 1000*1.3 = 1300 -> רווח ריאלי = 0 -> אין מס
    const result = calculateStockRealGainTax({
      purchasePrice: 100,
      quantity: 10, // originalCost = 1000
      currentValue: 1300,
      indexAtPurchase: 100,
      currentIndex: 130
    });
    expect(result.originalCost).toBe(1000);
    expect(result.adjustedCost).toBe(1300);
    expect(result.realGain).toBe(0);
    expect(result.tax).toBe(0);
  });

  test('taxes the portion of the gain that exceeds inflation', () => {
    const result = calculateStockRealGainTax({
      purchasePrice: 100,
      quantity: 10, // originalCost = 1000
      currentValue: 1500,
      indexAtPurchase: 100,
      currentIndex: 130 // adjustedCost = 1300
    });
    expect(result.realGain).toBe(200); // 1500 - 1300
    expect(result.tax).toBeCloseTo(200 * 0.25, 5);
  });

  test('caps the exempt (inflationary) amount at the nominal gain - real gain never goes negative when there is still a nominal gain (Moses case example 2)', () => {
    // currentValue(1200) > originalCost(1000): יש רווח נומינלי של 200,
    // גם אם ההצמדה התיאורטית (300) עולה עליו - הרווח הריאלי לא יורד
    // מתחת ל-0, הוא רק מתאפס.
    const result = calculateStockRealGainTax({
      purchasePrice: 100,
      quantity: 10,
      currentValue: 1200,
      indexAtPurchase: 100,
      currentIndex: 130 // adjustedCost = 1300 > 1200, אבל עדיין רווח נומינלי של 200
    });
    expect(result.realGain).toBe(0);
    expect(result.tax).toBe(0);
  });

  test('a genuine loss with a rising index is recognized in full, with no reduction (Moses case example 3 pattern)', () => {
    // currentValue(800) < originalCost(1000): הפסד נומינלי אמיתי של 200,
    // למרות שהמדד עלה - ההפסד מוכר במלואו, בלי "להגדיל" אותו לפי ההצמדה.
    const result = calculateStockRealGainTax({
      purchasePrice: 100,
      quantity: 10,
      currentValue: 800,
      indexAtPurchase: 100,
      currentIndex: 130
    });
    expect(result.realGain).toBe(-200);
    expect(result.tax).toBe(0);
  });
});

describe('calculatePensionRealGainTax', () => {
  const indexByMonth = {
    '2020-01': 100,
    '2023-01': 115,
    '2024-06': 130 // "המדד הידוע" הנוכחי
  };

  test('unlinked fund: flat 15% on the full nominal gain, no CPI adjustment', () => {
    const deposits = [{ date: '2020-01-10', amount: 50000 }, { date: '2023-01-10', amount: 20000 }];
    const result = calculatePensionRealGainTax({
      deposits,
      currentValue: 90000,
      isLinkedToIndex: false,
      currentIndex: 130,
      indexByMonth
    });
    expect(result.mode).toBe('nominal');
    expect(result.totalDeposited).toBe(70000);
    expect(result.gain).toBe(20000); // 90000 - 70000
    expect(result.tax).toBeCloseTo(20000 * 0.15, 5);
  });

  test('linked fund: each deposit is indexed separately by its own month, tax at 25% on the real gain only', () => {
    const deposits = [{ date: '2020-01-10', amount: 50000 }, { date: '2023-01-10', amount: 20000 }];
    // הפקדה 1: 50,000 מוצמדת מ-100 ל-130 -> 65,000
    // הפקדה 2: 20,000 מוצמדת מ-115 ל-130 -> 22,608.7...
    const result = calculatePensionRealGainTax({
      deposits,
      currentValue: 95000,
      isLinkedToIndex: true,
      currentIndex: 130,
      indexByMonth
    });
    const expectedAdjustedCost = 50000 * (130 / 100) + 20000 * (130 / 115);
    expect(result.mode).toBe('real');
    expect(result.adjustedCostBasis).toBeCloseTo(expectedAdjustedCost, 5);
    expect(result.gain).toBeCloseTo(95000 - expectedAdjustedCost, 5);
    expect(result.tax).toBeCloseTo(Math.max(0, 95000 - expectedAdjustedCost) * 0.25, 5);
  });

  test('linked fund with no real gain (value only kept up with inflation) owes no tax', () => {
    const deposits = [{ date: '2020-01-10', amount: 50000 }];
    const result = calculatePensionRealGainTax({
      deposits,
      currentValue: 65000, // exactly 50000 * (130/100)
      isLinkedToIndex: true,
      currentIndex: 130,
      indexByMonth
    });
    expect(result.gain).toBeCloseTo(0, 5);
    expect(result.tax).toBe(0);
  });

  test('missing index for a deposit month falls back to unadjusted cost for that deposit only', () => {
    const deposits = [{ date: '2099-01-10', amount: 10000 }]; // אין מדד לחודש הזה ב-indexByMonth
    const result = calculatePensionRealGainTax({
      deposits,
      currentValue: 12000,
      isLinkedToIndex: true,
      currentIndex: 130,
      indexByMonth
    });
    expect(result.adjustedCostBasis).toBe(10000); // fallback ללא הצמדה
    expect(result.gain).toBe(2000);
  });
});

// 5 הדוגמאות המדויקות מפסק דין מוזס (ע"א 3555/15, 3723/15, 5447/16 -
// עודד מוזס, נכסי ארקין, יצחק מוזס נ' פשמ"ג) - המקור הסמכותי לכלל
// האסימטרי שמיושם ב-calculateLinkedRealResult. כל דוגמה כאן היא
// ground-truth שנלקח ישירות מפסק הדין, לא הנחה שלנו.
describe('calculateLinkedRealResult - Moses case (ע"א 3555/15) worked examples', () => {
  test('example 1: gain + currency appreciation -> real 350, exempt 200', () => {
    // מכירה 150$@7=1050, רכישה 100$@5=500
    const result = calculateLinkedRealResult({ originalCost: 500, currentValue: 1050, adjustedCostBasis: 500 * (7 / 5) });
    expect(result.nominalGain).toBe(550);
    expect(result.exemptAmount).toBeCloseTo(200, 5);
    expect(result.realGain).toBeCloseTo(350, 5);
  });

  test('example 2: small gain + extreme currency appreciation -> real gain floors at 0, not negative', () => {
    // מכירה 50$@11=550, רכישה 100$@5=500
    const result = calculateLinkedRealResult({ originalCost: 500, currentValue: 550, adjustedCostBasis: 500 * (11 / 5) });
    expect(result.nominalGain).toBe(50);
    expect(result.realGain).toBe(0);
    expect(result.exemptAmount).toBe(50); // מוגבל לרווח הנומינלי (50), לא ל-600 התיאורטי
  });

  test('example 3: loss + currency appreciation -> loss recognized in full, not enlarged', () => {
    // מכירה 50$@7=350, רכישה 100$@5=500 (הפסד הון -150)
    const result = calculateLinkedRealResult({ originalCost: 500, currentValue: 350, adjustedCostBasis: 500 * (7 / 5) });
    expect(result.nominalGain).toBe(-150);
    // הנישום טען ל-(350) (הפסד ריאלי מוגדל) - זה נדחה; ההפסד המוכר הוא הנומינלי המלא בלבד
    expect(result.realGain).toBe(-150);
    expect(result.exemptAmount).toBe(0);
  });

  test('example 4: gain + currency depreciation -> full nominal gain is taxable, no relief', () => {
    // מכירה 200$@3=600, רכישה 100$@5=500
    const result = calculateLinkedRealResult({ originalCost: 500, currentValue: 600, adjustedCostBasis: 500 * (3 / 5) });
    expect(result.nominalGain).toBe(100);
    expect(result.realGain).toBe(100); // לא 300 (currentValue-adjustedCost), אלא הנומינלי המלא
    expect(result.exemptAmount).toBe(0);
  });

  test('example 5: loss + currency depreciation -> only part of the loss is deductible', () => {
    // מכירה 50$@3=150, רכישה 100$@5=500 (הפסד הון -350)
    const result = calculateLinkedRealResult({ originalCost: 500, currentValue: 150, adjustedCostBasis: 500 * (3 / 5) });
    expect(result.nominalGain).toBe(-350);
    expect(result.realGain).toBe(-150); // "הפסד בר קיזוז"
    expect(result.nonDeductibleAmount).toBe(-200); // "הפסד שאינו בר קיזוז" = (5-3)x100
  });

  test('tax is always 25% (or custom rate) of the final real gain, never of the nominal gain', () => {
    const result = calculateLinkedRealResult({ originalCost: 500, currentValue: 1050, adjustedCostBasis: 700, taxRate: 0.25 });
    expect(result.tax).toBeCloseTo(350 * 0.25, 5);
  });
});
