import { calculatePortfolioSummary } from './portfolioSummary';

describe('calculatePortfolioSummary', () => {
  test('returns all-zero summary for an empty portfolio', () => {
    const summary = calculatePortfolioSummary([], [], [], [], []);
    expect(summary.capitalTotalILS).toBe(0);
    expect(summary.totalProfitILS).toBe(0);
    expect(summary.totalProfitAfterTaxILS).toBe(0);
  });

  test('aggregates a single profitable Israeli stock correctly', () => {
    const israeliStocks = [
      { stockName: 'TEVA', quantity: 100, purchasePrice: 30, currentPrice: 3500, dailyChangePercent: 1.2, purchaseDate: '2023-01-15' }
    ];
    const summary = calculatePortfolioSummary(israeliStocks, [], [], [], []);
    // currentPrice 3500 agorot -> 35 shekels; value = 35*100=3500; purchase = 30*100=3000
    expect(summary.israeliOnlyPurchaseILS).toBe(3000);
    expect(summary.israeliOnlyCurrentValueILS).toBe(3500);
    expect(summary.israeliOnlyProfitILS).toBe(500);
    expect(summary.israeliOnlyTaxILS).toBeCloseTo(500 * 0.25, 5);
  });

  test('does not tax an Israeli stock at a loss', () => {
    const israeliStocks = [
      { stockName: 'TEVA', quantity: 100, purchasePrice: 50, currentPrice: 3500, dailyChangePercent: 0, purchaseDate: '2023-01-15' }
    ];
    const summary = calculatePortfolioSummary(israeliStocks, [], [], [], []);
    expect(summary.israeliOnlyProfitILS).toBeLessThan(0);
    expect(summary.israeliOnlyTaxILS).toBe(0);
  });

  test('includes American stocks converted to ILS in the combined totals', () => {
    const americanStocks = [
      { stockName: 'AAPL', quantity: 10, purchasePrice: 150, currentPrice: 190, exchangeRate: 3.6, currentExchangeRate: 3.7, dailyChangePercent: 0.8, purchaseDate: '2022-03-01' }
    ];
    const summary = calculatePortfolioSummary([], americanStocks, [], [], []);
    expect(summary.totalPurchaseUSD).toBe(1500);
    expect(summary.totalCurrentValueUSD).toBe(1900);
    expect(summary.capitalAmericanILS).toBeCloseTo(1900 * 3.7, 5);
  });

  test('includes pension, cash fund, and bank balances in capitalTotalILS', () => {
    const pensionFunds = [{ initialInvestment: 10000, currentValue: 12000, previousValue: 11500 }];
    const cashFunds = [{ amount: 5000 }];
    const bankBalances = [{ amount: 20000 }];
    const summary = calculatePortfolioSummary([], [], pensionFunds, cashFunds, bankBalances);
    expect(summary.capitalPensionILS).toBe(12000);
    expect(summary.capitalCashFundsILS).toBe(5000);
    expect(summary.capitalBankILS).toBe(20000);
    expect(summary.capitalTotalILS).toBe(12000 + 5000 + 20000);
  });

  describe('pension fund update-period return (excludes deposits from profit)', () => {
    test('a deposit with zero real investment return is NOT counted as profit', () => {
      // Deposited 1000, fund made 0 actual return this period.
      const pensionFunds = [{ initialInvestment: 5000, previousValue: 5000, currentValue: 6000, depositSinceLastUpdate: 1000 }];
      const summary = calculatePortfolioSummary([], [], pensionFunds, [], []);
      expect(summary.pensionUpdateProfitILS).toBe(0);
      expect(summary.pensionPreviousProfitPercent).toBe(0);
    });

    test('real investment return is still counted correctly alongside a deposit', () => {
      // Deposited 1000, fund also grew by an additional real 50 on top of that.
      const pensionFunds = [{ initialInvestment: 5000, previousValue: 5000, currentValue: 6050, depositSinceLastUpdate: 1000 }];
      const summary = calculatePortfolioSummary([], [], pensionFunds, [], []);
      expect(summary.pensionUpdateProfitILS).toBe(50);
      expect(summary.pensionPreviousProfitPercent).toBeCloseTo((50 / 5000) * 100, 5);
    });

    test('with no deposit field at all (legacy data), behaves exactly as before — full delta is profit', () => {
      const pensionFunds = [{ initialInvestment: 5000, previousValue: 5000, currentValue: 5200 }];
      const summary = calculatePortfolioSummary([], [], pensionFunds, [], []);
      expect(summary.pensionUpdateProfitILS).toBe(200);
    });

    test('a real loss is still reported correctly even with a deposit in the same period', () => {
      // Deposited 1000, but the fund actually lost 100 on top of that.
      const pensionFunds = [{ initialInvestment: 5000, previousValue: 5000, currentValue: 5900, depositSinceLastUpdate: 1000 }];
      const summary = calculatePortfolioSummary([], [], pensionFunds, [], []);
      expect(summary.pensionUpdateProfitILS).toBe(-100);
      expect(summary.pensionPreviousProfitPercent).toBeLessThan(0);
    });

    test('sums deposits across multiple pension funds', () => {
      const pensionFunds = [
        { initialInvestment: 5000, previousValue: 5000, currentValue: 5500, depositSinceLastUpdate: 400 },
        { initialInvestment: 3000, previousValue: 3000, currentValue: 3200, depositSinceLastUpdate: 100 }
      ];
      const summary = calculatePortfolioSummary([], [], pensionFunds, [], []);
      // Real returns: (5500-5000-400) + (3200-3000-100) = 100 + 100 = 200
      expect(summary.pensionUpdateProfitILS).toBe(200);
      expect(summary.pensionDepositSinceLastUpdateILS).toBe(500);
    });
  });

  test('capitalTotalILS sums every category together for a mixed portfolio', () => {
    const israeliStocks = [{ stockName: 'A', quantity: 10, purchasePrice: 10, currentPrice: 1200, dailyChangePercent: 0, purchaseDate: '2023-01-01' }];
    const americanStocks = [{ stockName: 'B', quantity: 5, purchasePrice: 100, currentPrice: 120, exchangeRate: 3.5, currentExchangeRate: 3.5, dailyChangePercent: 0, purchaseDate: '2023-01-01' }];
    const pensionFunds = [{ initialInvestment: 1000, currentValue: 1100, previousValue: 1050 }];
    const cashFunds = [{ amount: 500 }];
    const bankBalances = [{ amount: 2000 }];

    const summary = calculatePortfolioSummary(israeliStocks, americanStocks, pensionFunds, cashFunds, bankBalances);
    const expectedTotal =
      summary.capitalIsraeliILS +
      summary.capitalAmericanILS +
      summary.capitalCashFundsILS +
      summary.capitalPensionILS +
      summary.capitalBankILS;
    expect(summary.capitalTotalILS).toBeCloseTo(expectedTotal, 5);
  });

  test('does not throw on missing/undefined numeric fields', () => {
    const israeliStocks = [{ stockName: 'A' }];
    const americanStocks = [{ stockName: 'B' }];
    expect(() => calculatePortfolioSummary(israeliStocks, americanStocks, [], [], [])).not.toThrow();
  });
});
