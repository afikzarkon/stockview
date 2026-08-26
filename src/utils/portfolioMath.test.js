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

  test('profit in USD is current minus purchase, profit in ILS uses current rate', () => {
    const m = calculateAmericanStockMetrics(baseStock);
    expect(m.profitUSD).toBe(500);
    expect(m.profitILS).toBe(500 * 3.7); // 1850
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
});
