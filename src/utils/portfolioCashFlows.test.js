import { buildPortfolioCashFlows, cashFlowsInPeriod } from './portfolioCashFlows';

describe('buildPortfolioCashFlows', () => {
  test('treats each stock purchase lot as money entering the portfolio on its purchase date', () => {
    const flows = buildPortfolioCashFlows({
      israeliStocks: [{ stockName: '629014', purchaseDate: '2024-02-01', purchasePrice: 30, quantity: 100 }]
    });
    expect(flows).toEqual([{ date: '2024-02-01', amount: 3000 }]);
  });

  // The rate actually paid, not today's rate: using the current rate would
  // fold an FX move into the flow and cancel out part of the very
  // performance being measured.
  test('converts an American lot at the exchange rate paid on the day, not the current one', () => {
    const flows = buildPortfolioCashFlows({
      americanStocks: [
        {
          stockName: 'AAPL',
          purchaseDate: '2024-02-01',
          purchasePrice: 100,
          quantity: 10,
          exchangeRate: 3.6,
          currentExchangeRate: 4.2
        }
      ]
    });
    expect(flows).toEqual([{ date: '2024-02-01', amount: 3600 }]);
  });

  test('reads every dated deposit from the provident, money-market and savings ledgers', () => {
    const flows = buildPortfolioCashFlows({
      pensionFunds: [{ fundName: 'גמל', deposits: [{ date: '2024-03-01', amount: 1000 }] }],
      cashFunds: [{ fundName: 'כספית', deposits: [{ date: '2024-04-01', amount: 500 }] }],
      bankSavingsFunds: [{ fundName: 'חיסכון', deposits: [{ date: '2024-05-01', amount: 250 }] }]
    });
    expect(flows).toEqual([
      { date: '2024-03-01', amount: 1000 },
      { date: '2024-04-01', amount: 500 },
      { date: '2024-05-01', amount: 250 }
    ]);
  });

  // A current account is a single overwritten balance with no ledger, so a
  // change in it can't be told apart from spending or from a transfer to a
  // broker that is already counted as a stock purchase. Guessing would
  // double-count real flows.
  test('does not invent flows from a current account balance', () => {
    const flows = buildPortfolioCashFlows({
      bankBalances: [{ amount: 9000, updateDate: '2024-03-01' }]
    });
    expect(flows).toEqual([]);
  });

  test('returns flows sorted by date across every source', () => {
    const flows = buildPortfolioCashFlows({
      israeliStocks: [{ stockName: 'A', purchaseDate: '2024-06-01', purchasePrice: 1, quantity: 1 }],
      pensionFunds: [{ deposits: [{ date: '2024-01-01', amount: 100 }] }],
      cashFunds: [{ deposits: [{ date: '2024-03-01', amount: 50 }] }]
    });
    expect(flows.map((f) => f.date)).toEqual(['2024-01-01', '2024-03-01', '2024-06-01']);
  });

  test('skips undated and zero-value entries rather than emitting junk flows', () => {
    const flows = buildPortfolioCashFlows({
      israeliStocks: [
        { stockName: 'A', purchaseDate: null, purchasePrice: 10, quantity: 10 },
        { stockName: 'B', purchaseDate: '2024-01-01', purchasePrice: 0, quantity: 10 }
      ],
      pensionFunds: [{ deposits: [{ date: 'not-a-date', amount: 500 }] }]
    });
    expect(flows).toEqual([]);
  });

  test('handles a missing/empty portfolio gracefully', () => {
    expect(buildPortfolioCashFlows()).toEqual([]);
    expect(buildPortfolioCashFlows({})).toEqual([]);
  });
});

describe('cashFlowsInPeriod', () => {
  const flows = [
    { date: '2024-01-01', amount: 100 },
    { date: '2024-02-15', amount: 200 },
    { date: '2024-03-01', amount: 300 }
  ];

  // A flow dated exactly on the period start is already reflected in that
  // point's value - counting it again would net the same money out twice.
  test('is exclusive of the period start and inclusive of the period end', () => {
    expect(cashFlowsInPeriod(flows, '2024-01-01', '2024-03-01')).toEqual([
      { date: '2024-02-15', amount: 200 },
      { date: '2024-03-01', amount: 300 }
    ]);
  });

  test('returns an empty list when nothing falls inside', () => {
    expect(cashFlowsInPeriod(flows, '2024-03-01', '2024-04-01')).toEqual([]);
    expect(cashFlowsInPeriod(null, '2024-01-01', '2024-02-01')).toEqual([]);
  });
});
