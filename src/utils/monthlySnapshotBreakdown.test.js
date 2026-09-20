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

  test('builds one item per bank savings fund, keyed/labeled by fund name', () => {
    const bankSavingsFunds = [
      { id: 7, fundName: 'חיסכון X', interestRate: 0, deposits: [{ date: '2024-01-01', amount: 10000 }] }
    ];
    const result = buildItemizedMonthlyBreakdown(analysis, [], [], [], bankSavingsFunds);
    expect(result.bankSavings).toEqual([{ key: 'חיסכון X', label: 'חיסכון X', value: 10000 }]);
  });

  test('a category with nothing to show returns an empty array, never a fabricated item', () => {
    const result = buildItemizedMonthlyBreakdown({ stockDistribution: [] }, [], [], []);
    expect(result).toEqual({ israeli: [], american: [], pension: [], cashFunds: [], bank: [], bankSavings: [] });
  });

  test('handles a missing analysis/stockDistribution gracefully', () => {
    const result = buildItemizedMonthlyBreakdown(undefined, [], [], []);
    expect(result.israeli).toEqual([]);
    expect(result.american).toEqual([]);
  });
});

// A monthly checkpoint's item KEY is what two months are matched on when
// they're compared, so it must stay the raw security id / ticker even as
// the displayed label gains the security's name. Changing the key would
// silently stop a holding lining up with itself across months.
describe('item keys vs. labels', () => {
  const analysis = {
    stockDistribution: [
      { name: '629014', displayName: 'טבע (629014)', value: 1000, exchange: 'israeli' },
      { name: 'AAPL', displayName: 'AAPL', value: 2000, exchange: 'american' }
    ]
  };

  test('labels a holding with its name and security id, while keying it by the id alone', () => {
    const breakdown = buildItemizedMonthlyBreakdown(analysis, [], [], [], []);
    expect(breakdown.israeli).toEqual([{ key: '629014', label: 'טבע (629014)', value: 1000 }]);
    expect(breakdown.american).toEqual([{ key: 'AAPL', label: 'AAPL', value: 2000 }]);
  });

  test('falls back to the key as the label for a holding with no resolved name', () => {
    const breakdown = buildItemizedMonthlyBreakdown(
      { stockDistribution: [{ name: '1234567', value: 500, exchange: 'israeli' }] },
      [],
      [],
      [],
      []
    );
    expect(breakdown.israeli).toEqual([{ key: '1234567', label: '1234567', value: 500 }]);
  });
});
