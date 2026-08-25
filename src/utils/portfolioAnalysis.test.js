import { calculatePortfolioAnalysis } from './portfolioAnalysis';

describe('calculatePortfolioAnalysis', () => {
  test('handles an empty portfolio without throwing', () => {
    const analysis = calculatePortfolioAnalysis([], [], [], [], []);
    expect(analysis.exchangeDistribution.total).toBe(0);
    expect(analysis.stockDistribution).toEqual([]);
    expect(analysis.reports.topPerformers).toEqual([]);
    expect(analysis.reports.worstPerformers).toEqual([]);
  });

  test('groups multiple lots of the same stock into one distribution entry', () => {
    const israeliStocks = [
      { stockName: 'TEVA', quantity: 100, purchasePrice: 30, currentPrice: 3500, dailyChangePercent: 1.2, purchaseDate: '2023-01-15' },
      { stockName: 'TEVA', quantity: 50, purchasePrice: 32, currentPrice: 3500, dailyChangePercent: 1.2, purchaseDate: '2023-06-01' }
    ];
    const analysis = calculatePortfolioAnalysis(israeliStocks, [], [], [], []);
    const tevaEntries = analysis.stockDistribution.filter((s) => s.name === 'TEVA');
    expect(tevaEntries).toHaveLength(1);
    expect(tevaEntries[0].totalQuantity).toBe(150);
  });

  test('exchangeDistribution percentages sum to ~100% across categories', () => {
    const israeliStocks = [{ stockName: 'A', quantity: 10, purchasePrice: 10, currentPrice: 1200, dailyChangePercent: 0, purchaseDate: '2023-01-01' }];
    const americanStocks = [{ stockName: 'B', quantity: 5, purchasePrice: 100, currentPrice: 120, exchangeRate: 3.5, currentExchangeRate: 3.5, dailyChangePercent: 0, purchaseDate: '2023-01-01' }];
    const pensionFunds = [{ initialInvestment: 1000, currentValue: 1100, previousValue: 1050, updateDate: '2023-01-01' }];
    const cashFunds = [{ amount: 500, updateDate: '2023-01-01' }];
    const bankBalances = [{ amount: 2000, updateDate: '2023-01-01' }];

    const analysis = calculatePortfolioAnalysis(israeliStocks, americanStocks, pensionFunds, cashFunds, bankBalances);
    const { israeli, american, pension, cashFunds: cf, bank } = analysis.exchangeDistribution;
    const totalPercent = israeli.percentage + american.percentage + pension.percentage + cf.percentage + bank.percentage;
    expect(totalPercent).toBeCloseTo(100, 5);
  });

  test('classifies profitable stocks as topPerformers and losing stocks as worstPerformers', () => {
    const israeliStocks = [
      { stockName: 'WINNER', quantity: 10, purchasePrice: 10, currentPrice: 2000, dailyChangePercent: 0, purchaseDate: '2023-01-01' }, // profit
      { stockName: 'LOSER', quantity: 10, purchasePrice: 50, currentPrice: 30, dailyChangePercent: 0, purchaseDate: '2023-01-01' }   // loss (currentPrice already in shekels, no agorot conversion since <=1000)
    ];
    const analysis = calculatePortfolioAnalysis(israeliStocks, [], [], [], []);
    const topNames = analysis.reports.topPerformers.map((s) => s.name);
    const worstNames = analysis.reports.worstPerformers.map((s) => s.name);
    expect(topNames).toContain('WINNER');
    expect(worstNames).toContain('LOSER');
    expect(topNames).not.toContain('LOSER');
    expect(worstNames).not.toContain('WINNER');
  });

  test('largestPositions is sorted descending by value', () => {
    const israeliStocks = [
      { stockName: 'SMALL', quantity: 1, purchasePrice: 10, currentPrice: 1000, dailyChangePercent: 0, purchaseDate: '2023-01-01' },
      { stockName: 'BIG', quantity: 100, purchasePrice: 10, currentPrice: 1000, dailyChangePercent: 0, purchaseDate: '2023-01-01' }
    ];
    const analysis = calculatePortfolioAnalysis(israeliStocks, [], [], [], []);
    const values = analysis.reports.largestPositions.map((s) => s.value);
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(analysis.reports.largestPositions[0].name).toBe('BIG');
  });

  test('summaryMetrics.positionsCount includes every category', () => {
    const israeliStocks = [{ stockName: 'A', quantity: 1, purchasePrice: 1, currentPrice: 100, purchaseDate: '2023-01-01' }];
    const americanStocks = [{ stockName: 'B', quantity: 1, purchasePrice: 1, currentPrice: 1, exchangeRate: 3.5, purchaseDate: '2023-01-01' }];
    const pensionFunds = [{ currentValue: 100, updateDate: '2023-01-01' }];
    const cashFunds = [{ amount: 100, updateDate: '2023-01-01' }];
    const bankBalances = [{ amount: 100, updateDate: '2023-01-01' }];
    const analysis = calculatePortfolioAnalysis(israeliStocks, americanStocks, pensionFunds, cashFunds, bankBalances);
    // 2 distinct stock names + 1 pension + 1 cash fund + 1 bank = 5
    expect(analysis.summaryMetrics.positionsCount).toBe(5);
  });

  test('does not throw on missing/undefined numeric fields', () => {
    const israeliStocks = [{ stockName: 'A' }];
    expect(() => calculatePortfolioAnalysis(israeliStocks, [], [], [], [])).not.toThrow();
  });
});
