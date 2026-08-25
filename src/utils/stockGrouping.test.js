import { groupStocksByName, calculateGroupSummary } from './stockGrouping';

describe('groupStocksByName', () => {
  test('groups stocks with the same name into an array', () => {
    const stocks = [
      { stockName: 'TEVA', id: 1 },
      { stockName: 'ICL', id: 2 },
      { stockName: 'TEVA', id: 3 }
    ];
    const grouped = groupStocksByName(stocks);
    expect(Object.keys(grouped)).toEqual(['TEVA', 'ICL']);
    expect(grouped.TEVA).toHaveLength(2);
    expect(grouped.ICL).toHaveLength(1);
  });

  test('returns empty object for empty input', () => {
    expect(groupStocksByName([])).toEqual({});
  });
});

describe('calculateGroupSummary', () => {
  test('sums quantity and purchase/current values across lots', () => {
    const stocks = [
      { quantity: 100, purchasePrice: 30, currentPrice: 3500 }, // 3500 agorot -> 35 shekels
      { quantity: 50, purchasePrice: 32, currentPrice: 3500 }
    ];
    const summary = calculateGroupSummary(stocks);
    expect(summary.totalQuantity).toBe(150);
    expect(summary.totalPurchaseValue).toBe(100 * 30 + 50 * 32); // 4600
    expect(summary.totalCurrentValue).toBe(150 * 35); // 5250
  });

  test('averagePurchasePrice/averageCurrentPrice are quantity-weighted', () => {
    const stocks = [
      { quantity: 100, purchasePrice: 30, currentPrice: 3500 },
      { quantity: 50, purchasePrice: 32, currentPrice: 3500 }
    ];
    const summary = calculateGroupSummary(stocks);
    expect(summary.averagePurchasePrice).toBeCloseTo(summary.totalPurchaseValue / 150, 5);
    expect(summary.averageCurrentPrice).toBeCloseTo(summary.totalCurrentValue / 150, 5);
  });

  test('handles a single-lot group same as a multi-lot one', () => {
    const summary = calculateGroupSummary([{ quantity: 10, purchasePrice: 5, currentPrice: 600 }]);
    expect(summary.totalQuantity).toBe(10);
    expect(summary.totalPurchaseValue).toBe(50);
  });
});
