import { TAX_RATE, calculateAmericanStockMetrics, applyPensionCurrentValueUpdate } from './portfolioMath';

describe('calculateAmericanStockMetrics', () => {
  const baseStock = {
    purchasePrice: 100,
    quantity: 10,
    exchangeRate: 3.5,       // rate at purchase time
    currentPrice: 150,
    currentExchangeRate: 3.7 // rate today
  };

  test('computes USD purchase/current values from price * quantity', () => {
    const m = calculateAmericanStockMetrics(baseStock);
    expect(m.totalPurchaseUSD).toBe(1000);
    expect(m.totalCurrentValueUSD).toBe(1500);
  });

  test('converts to ILS using the exchange rate at each point in time', () => {
    const m = calculateAmericanStockMetrics(baseStock);
    expect(m.totalPurchaseILS).toBe(1000 * 3.5); // 3500
    expect(m.totalCurrentValueILS).toBe(1500 * 3.7); // 5550
  });

  test('profit in USD is current minus purchase; profit in ILS is the true nominal shekel gain', () => {
    const m = calculateAmericanStockMetrics(baseStock);
    expect(m.profitUSD).toBe(500);
    // רווח נומינלי אמיתי = שווי היום בש"ח פחות עלות הקנייה בש"ח
    // (5550 - 3500), לא profitUSD*currentExchangeRate (שזה הרווח הריאלי)
    expect(m.profitILS).toBe(m.totalCurrentValueILS - m.totalPurchaseILS); // 2050
  });

  test('tax only applies to positive profit, at TAX_RATE', () => {
    const m = calculateAmericanStockMetrics(baseStock);
    expect(m.taxUSD).toBeCloseTo(500 * TAX_RATE, 5); // 125
    expect(m.taxILS).toBeCloseTo(125 * 3.7, 5);
  });

  test('no tax is charged on a loss', () => {
    const losingStock = { ...baseStock, currentPrice: 50 }; // below purchase price
    const m = calculateAmericanStockMetrics(losingStock);
    expect(m.profitUSD).toBeLessThan(0);
    expect(m.taxUSD).toBe(0);
    expect(m.taxILS).toBe(0);
  });

  test('afterTax = profit - tax, in both currencies', () => {
    const m = calculateAmericanStockMetrics(baseStock);
    expect(m.afterTaxUSD).toBeCloseTo(m.profitUSD - m.taxUSD, 5);
    expect(m.afterTaxILS).toBeCloseTo(m.profitILS - m.taxILS, 5);
  });

  test('falls back to purchase exchangeRate when currentExchangeRate is missing', () => {
    const stockWithoutCurrentRate = { ...baseStock, currentExchangeRate: undefined };
    const m = calculateAmericanStockMetrics(stockWithoutCurrentRate);
    expect(m.currentExchangeRate).toBe(baseStock.exchangeRate);
  });

  test('exchangeRateImpact isolates the FX-only gain/loss on the current position', () => {
    const m = calculateAmericanStockMetrics(baseStock);
    // (current price * qty) * (currentRate - purchaseRate)
    const expected = 150 * 10 * (3.7 - 3.5);
    expect(m.exchangeRateImpact).toBeCloseTo(expected, 5);
  });

  test('exchangeRateImpact is 0 when the rate hasn\'t moved', () => {
    const stableStock = { ...baseStock, currentExchangeRate: baseStock.exchangeRate };
    const m = calculateAmericanStockMetrics(stableStock);
    expect(m.exchangeRateImpact).toBe(0);
  });

  test('handles missing/zero fields without throwing (defensive defaults)', () => {
    expect(() => calculateAmericanStockMetrics({})).not.toThrow();
    const m = calculateAmericanStockMetrics({});
    expect(m.totalPurchaseUSD).toBe(0);
    expect(m.totalCurrentValueUSD).toBe(0);
    expect(m.profitUSD).toBe(0);
  });

  test('accepts a custom tax rate override', () => {
    const m = calculateAmericanStockMetrics(baseStock, 0.1);
    expect(m.taxUSD).toBeCloseTo(500 * 0.1, 5);
  });

  test('exposes the real vs. currency-exempt breakdown, mirroring the CPI-linked stock formula', () => {
    // קניתי ב-1000$ (מדד/שער=3.5), היום שווה 1000$ (מדד/שער=4.2) - אין
    // שינוי במחיר המניה עצמה, כל הרווח בשקלים נובע רק משינוי השער ולכן
    // כולו פטור (רווח ריאלי = 0, אין מס).
    const stableStock = { purchasePrice: 100, quantity: 10, exchangeRate: 3.5, currentPrice: 100, currentExchangeRate: 4.2 };
    const m = calculateAmericanStockMetrics(stableStock);
    expect(m.realGainILS).toBeCloseTo(0, 5);
    expect(m.taxILS).toBe(0);
    expect(m.currencyExemptGainILS).toBeCloseTo(1000 * (4.2 - 3.5), 5); // 700
    // הריאלי + הפטור מהמטבע = הרווח הנומינלי המלא בשקלים
    expect(m.realGainILS + m.currencyExemptGainILS).toBeCloseTo(m.totalCurrentValueILS - m.totalPurchaseILS, 5);
  });

  test('taxes only the real gain, which can differ from the (now nominal) profitILS', () => {
    const m = calculateAmericanStockMetrics(baseStock); // price 100->150, rate 3.5->3.7
    // profitILS הוא עכשיו הנומינלי (2050), realGainILS הוא מה שחייב במס (500*3.7=1850)
    expect(m.realGainILS).toBeCloseTo(500 * 3.7, 5);
    expect(m.taxILS).toBeCloseTo(m.realGainILS * 0.25, 5);
    // ולוודא שהפירוק תמיד מסתכם לנומינלי
    expect(m.realGainILS + m.currencyExemptGainILS).toBeCloseTo(m.profitILS, 5);
  });

  test('can owe tax even when the true nominal ILS result is a loss (large currency depreciation)', () => {
    // בדיוק הדוגמה שנבדקה בשיחה: מניה שנקנתה ב-192$ בשער 3.7, נמכרה
    // ב-213.05$ בשער 2.96 - רווח דולרי אמיתי, אבל הפסד נומינלי בשקלים.
    const stock = { purchasePrice: 192, quantity: 1, exchangeRate: 3.7, currentPrice: 213.05, currentExchangeRate: 2.96 };
    const m = calculateAmericanStockMetrics(stock);
    expect(m.profitILS).toBeLessThan(0); // הפסד נומינלי אמיתי
    expect(m.realGainILS).toBeGreaterThan(0); // אבל יש רווח ריאלי
    expect(m.taxILS).toBeGreaterThan(0); // ולכן כן חייבים במס
    expect(m.afterTaxILS).toBeLessThan(m.profitILS); // אחרי מס המצב גרוע עוד יותר
  });

  test('Moses case example 3 pattern: nominal loss with currency appreciation is recognized in full, not enlarged', () => {
    // מחיר המניה ירד (הפסד דולרי אמיתי) והשקל נחלש מולה - שני הגורמים
    // "מסכימים" על הפסד, אבל אסור "להגדיל" את ההפסד לפי הצמדה נוחה.
    const stock = { purchasePrice: 100, quantity: 1, exchangeRate: 5, currentPrice: 50, currentExchangeRate: 7 };
    const m = calculateAmericanStockMetrics(stock); // purchase=500, current=350, nominal=-150
    expect(m.profitILS).toBe(-150);
    expect(m.realGainILS).toBe(-150); // לא -350 (מוגדל לפי הצמדה)
    expect(m.taxILS).toBe(0);
  });

  test('Moses case example 4 pattern: nominal gain with currency depreciation is fully taxable, no relief', () => {
    const stock = { purchasePrice: 100, quantity: 1, exchangeRate: 5, currentPrice: 200, currentExchangeRate: 3 };
    const m = calculateAmericanStockMetrics(stock); // purchase=500, current=600, nominal=100
    expect(m.profitILS).toBe(100);
    expect(m.realGainILS).toBe(100); // לא 300 (currentValue-adjustedCost הגולמי)
    expect(m.taxILS).toBeCloseTo(25, 5);
  });
});

describe('applyPensionCurrentValueUpdate', () => {
  test('nets out a deposit made during the period so it is not counted as profit', () => {
    // מקרה מהשאלה: previousValue=100,000, הפקדה של 10,000, שווי חדש=111,000
    // (כלומר 1,000 רווח אמיתי מהשוק) - התשואה שתחושב בפעם הבאה צריכה
    // להיות מבוססת על previousValue מותאם ל-110,000 (100,000+10,000),
    // כך ש-(111,000/110,000-1)*100 ≈ 0.91% ולא 11%.
    const fund = {
      currentValue: 100000,
      previousValue: 90000,
      initialInvestment: 90000,
      lastDeposit: 10000,
      amount: 100000
    };
    const updated = applyPensionCurrentValueUpdate(fund, 111000);
    expect(updated.currentValue).toBe(111000);
    expect(updated.previousValue).toBe(110000); // 100000 (old currentValue) + 10000 deposit
    expect(updated.lastDeposit).toBe(0); // reset for the next period

    const realReturnPercent = ((updated.currentValue / updated.previousValue) - 1) * 100;
    expect(realReturnPercent).toBeCloseTo(0.909, 2);
  });

  test('adds the deposit to the cumulative total invested (initialInvestment)', () => {
    const fund = { currentValue: 100000, initialInvestment: 90000, lastDeposit: 10000 };
    const updated = applyPensionCurrentValueUpdate(fund, 111000);
    expect(updated.initialInvestment).toBe(100000); // 90000 + 10000
  });

  test('behaves like a plain rollover when there is no deposit', () => {
    const fund = { currentValue: 100000, initialInvestment: 90000, lastDeposit: 0 };
    const updated = applyPensionCurrentValueUpdate(fund, 105000);
    expect(updated.previousValue).toBe(100000);
    expect(updated.initialInvestment).toBe(90000);
  });

  test('falls back to amount when currentValue/initialInvestment/lastDeposit are missing', () => {
    const fund = { amount: 50000 };
    const updated = applyPensionCurrentValueUpdate(fund, 55000);
    expect(updated.previousValue).toBe(50000);
    expect(updated.initialInvestment).toBe(50000);
    expect(updated.currentValue).toBe(55000);
    expect(updated.amount).toBe(55000);
  });

  test('records a deposit made this period into the deposits ledger with its own date', () => {
    const fund = {
      currentValue: 100000,
      initialInvestment: 90000,
      lastDeposit: 10000,
      lastDepositDate: '2024-03-05',
      updateDate: '2024-03-31',
      deposits: [{ date: '2020-01-10', amount: 90000 }]
    };
    const updated = applyPensionCurrentValueUpdate(fund, 111000);
    expect(updated.deposits).toEqual([
      { date: '2020-01-10', amount: 90000 },
      { date: '2024-03-05', amount: 10000 }
    ]);
    expect(updated.lastDepositDate).toBe('');
  });

  test('falls back to updateDate for the deposit date when lastDepositDate is not set', () => {
    const fund = { currentValue: 100000, lastDeposit: 5000, updateDate: '2024-04-30', deposits: [] };
    const updated = applyPensionCurrentValueUpdate(fund, 106000);
    expect(updated.deposits).toEqual([{ date: '2024-04-30', amount: 5000 }]);
  });

  test('does not add anything to the deposits ledger when there is no deposit', () => {
    const fund = { currentValue: 100000, lastDeposit: 0, deposits: [{ date: '2020-01-10', amount: 100000 }] };
    const updated = applyPensionCurrentValueUpdate(fund, 102000);
    expect(updated.deposits).toEqual([{ date: '2020-01-10', amount: 100000 }]);
  });
});
