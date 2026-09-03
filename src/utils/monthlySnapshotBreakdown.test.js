import { buildItemizedMonthlyBreakdown } from './monthlySnapshotBreakdown';

const analysis = {
  stockDistribution: [
    { name: 'TEVA', value: 3500, exchange: 'israeli' },
    { name: 'PLTR', value: 5000, exchange: 'american' },
    { name: 'AAPL', value: 19000, exchange: 'american' }
  ]
};

describe('buildItemizedMonthlyBreakdown', () => {
  test('splits stockDistribution into israeli/american item lists with just name+value (no profit/tax fields)', () => {
    const result = buildItemizedMonthlyBreakdown(analysis, [], [], []);
    expect(result.israeli).toEqual([{ key: 'TEVA', label: 'TEVA', value: 3500 }]);
    expect(result.american).toEqual([
      { key: 'PLTR', label: 'PLTR', value: 5000 },
      { key: 'AAPL', label: 'AAPL', value: 19000 }
    ]);
  });

  test('builds one item per pension fund, keyed/labeled by fund name', () => {
    const pensionFunds = [
      { id: 1, fundName: 'קופה א', currentValue: 40000 },
      { id: 2, fundName: 'קופה ב', amount: 12000 } // no currentValue -> falls back to amount
    ];
    const result = buildItemizedMonthlyBreakdown(analysis, pensionFunds, [], []);
    expect(result.pension).toEqual([
      { key: 'קופה א', label: 'קופה א', value: 40000 },
      { key: 'קופה ב', label: 'קופה ב', value: 12000 }
    ]);
  });

  test('builds one item per cash fund, keyed/labeled by fund name', () => {
    const cashFunds = [{ id: 5, fundName: 'קרן כספית X', amount: 8000 }];
    const result = buildItemizedMonthlyBreakdown(analysis, [], cashFunds, []);
    expect(result.cashFunds).toEqual([{ key: 'קרן כספית X', label: 'קרן כספית X', value: 8000 }]);
  });

  test('a single bank balance is labeled plainly ("עו"ש"), multiple are numbered', () => {
    const single = buildItemizedMonthlyBreakdown(analysis, [], [], [{ id: 1, amount: 20000 }]);
    expect(single.bank).toEqual([{ key: 'bank-1', label: 'עו"ש', value: 20000 }]);

    const multiple = buildItemizedMonthlyBreakdown(analysis, [], [], [
      { id: 1, amount: 20000 },
      { id: 2, amount: 5000 }
    ]);
    expect(multiple.bank).toEqual([
      { key: 'bank-1', label: 'עו"ש #1', value: 20000 },
      { key: 'bank-2', label: 'עו"ש #2', value: 5000 }
    ]);
  });

  test('a category with nothing to show returns an empty array, never a fabricated item', () => {
    const result = buildItemizedMonthlyBreakdown({ stockDistribution: [] }, [], [], []);
    expect(result).toEqual({ israeli: [], american: [], pension: [], cashFunds: [], bank: [] });
  });

  test('handles a missing analysis/stockDistribution gracefully', () => {
    const result = buildItemizedMonthlyBreakdown(undefined, [], [], []);
    expect(result.israeli).toEqual([]);
    expect(result.american).toEqual([]);
  });
});
