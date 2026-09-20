// Regression coverage for two defects that made the performance curve
// report returns the portfolio never had. Both were found by valuing a
// portfolio whose real answer is known by construction - a single holding
// that went from 30 to 60 a share, i.e. exactly +100% - and checking what
// the engine said about it.
import { computePortfolioValueAtDate } from './historicalPortfolioValue';
import {
  buildSeriesFromHistoricalValues,
  computeStatsFromSeries,
  summarizePartialPoints
} from './portfolioStats';
import { buildPortfolioCashFlows } from './portfolioCashFlows';
import { valueOfLedgerAccountAtDate, openingBalanceOfLedgerAccount } from './ledgerAccountHistory';

const israeliStocks = [
  { stockName: 'TEVA', quantity: 100, purchasePrice: 30, purchaseDate: '2022-01-03' }
];

// A bare current account: one balance, one date, and no deposit ledger
// behind it - the shape a checking account always has.
const bankBalances = [{ id: 1, amount: 20000, updateDate: '2024-06-01' }];

const closes = {
  taseHistoricalCloses: {
    TEVA: [
      { date: '2022-01-03', close: 3000 }, // agorot -> 30 shekels
      { date: '2023-01-03', close: 4500 },
      { date: '2024-01-03', close: 6000 },
      { date: '2024-07-01', close: 6000 } // 60 shekels -> the holding doubled
    ]
  }
};

const DATES = ['2022-01-03', '2023-01-03', '2024-01-03', '2024-07-01'];

const valueSeries = (holdings, options) =>
  DATES.map((date) => computePortfolioValueAtDate(date, holdings, closes, options));

describe('a ledger balance must not be asserted before there is evidence of it', () => {
  // THE BUG: a balance recorded in June 2024 was carried all the way back
  // to 2022, adding a constant 20,000 to both ends of every sub-period.
  // That drags every percentage toward zero - the holding below genuinely
  // doubled, and the chart reported +13%.
  test('back-projecting a bare balance understates the return (the old behaviour)', () => {
    const series = valueSeries({ israeliStocks, bankBalances });
    const stats = computeStatsFromSeries(
      buildSeriesFromHistoricalValues(series),
      buildPortfolioCashFlows({ israeliStocks })
    );
    // Documented, not endorsed: this is what the un-anchored valuation
    // still produces, and why the performance path no longer uses it.
    expect(stats.totalReturnPercent).toBeLessThan(20);
  });

  test('anchored to first evidence, the same portfolio reports its real return', () => {
    const series = valueSeries(
      { israeliStocks, bankBalances },
      { anchorLedgerAccountsToFirstRecord: true }
    );
    const stats = computeStatsFromSeries(
      buildSeriesFromHistoricalValues(series),
      buildPortfolioCashFlows({
        israeliStocks,
        bankBalances,
        includeLedgerOpeningBalances: true
      })
    );
    expect(stats.totalReturnPercent).toBeCloseTo(100, 1);
  });

  test('the account contributes nothing before its first record, and its balance after', () => {
    const series = valueSeries(
      { israeliStocks, bankBalances },
      { anchorLedgerAccountsToFirstRecord: true }
    );
    expect(series[0].byCategory.bank).toBe(0);
    expect(series[1].byCategory.bank).toBe(0);
    expect(series[3].byCategory.bank).toBe(20000);
  });

  // The two halves of the fix only work together: zeroing the account
  // without declaring the balance that then appears would book 20,000 of
  // contribution as a 20,000 gain.
  test('the appearing balance is declared as a contribution, not left to read as growth', () => {
    const flows = buildPortfolioCashFlows({
      israeliStocks,
      bankBalances,
      includeLedgerOpeningBalances: true
    });
    expect(flows).toContainEqual({ date: '2024-06-01', amount: 20000 });
  });

  test('without the opening-balance flow the same series reports a huge phantom gain', () => {
    const series = valueSeries(
      { israeliStocks, bankBalances },
      { anchorLedgerAccountsToFirstRecord: true }
    );
    const stats = computeStatsFromSeries(
      buildSeriesFromHistoricalValues(series),
      buildPortfolioCashFlows({ israeliStocks }) // flows NOT opted in
    );
    expect(stats.totalReturnPercent).toBeGreaterThan(300);
  });

  // An account whose opening value is fully explained by its own deposit
  // ledger has no unexplained balance, so it must not produce a second,
  // duplicate flow for money the ledger already records.
  test('an account opened by a deposit adds no duplicate opening flow', () => {
    const cashFunds = [
      {
        id: 7,
        fundName: 'Money market',
        currentValue: 5200,
        currentValueDate: '2024-01-01',
        deposits: [{ date: '2023-06-01', amount: 5000 }]
      }
    ];
    expect(openingBalanceOfLedgerAccount(cashFunds[0])).toBeCloseTo(0, 5);
    const flows = buildPortfolioCashFlows({ cashFunds, includeLedgerOpeningBalances: true });
    expect(flows).toEqual([{ date: '2023-06-01', amount: 5000 }]);
  });

  // The monthly tracker reconstructs a past month and wants the best
  // estimate available, so the old carry-back stays the default.
  test('the point-in-time default is unchanged, for the monthly tracker', () => {
    expect(valueOfLedgerAccountAtDate(bankBalances[0], '2022-01-03')).toBe(20000);
    expect(
      valueOfLedgerAccountAtDate(bankBalances[0], '2022-01-03', { anchorToFirstRecord: true })
    ).toBe(0);
  });
});

describe('a date that cannot be fully valued is not a valuation', () => {
  const withUnpriced = [
    ...israeliStocks,
    // No close history at all - a delisted ticker, or one the price feed
    // does not cover.
    { stockName: 'NOPRICE', quantity: 50, purchasePrice: 100, purchaseDate: '2022-01-03' }
  ];

  // THE BUG: the point's value was the sum of the REST of the portfolio, so
  // the curve fell off a cliff on the first date the missing holding needed
  // a close, and climbed back later. The reported return was -25% for
  // holdings that had gained 100%.
  test('a partial point is excluded from the plotted series', () => {
    const series = valueSeries({ israeliStocks: withUnpriced });
    expect(series[1].isPartial).toBe(true);
    // 4500 is what the partial sum would have been - the rest of the
    // portfolio, drawn as though it were the whole of it.
    expect(buildSeriesFromHistoricalValues(series).map((p) => p.value)).not.toContain(4500);
  });

  test('the skipped dates and the holdings responsible are reported, not swallowed', () => {
    const series = valueSeries({ israeliStocks: withUnpriced });
    const partial = summarizePartialPoints(series);
    expect(partial.count).toBe(3);
    expect(partial.symbols).toEqual(['NOPRICE']);
  });

  test('a fully-priced portfolio skips nothing', () => {
    const partial = summarizePartialPoints(valueSeries({ israeliStocks }));
    expect(partial).toEqual({ count: 0, symbols: [] });
  });

  // Saying nothing beats saying something false: with too few valuable
  // dates left, there is no return figure rather than an invented one.
  test('no return is reported when too little could be valued', () => {
    const series = valueSeries({ israeliStocks: withUnpriced });
    const stats = computeStatsFromSeries(
      buildSeriesFromHistoricalValues(series),
      buildPortfolioCashFlows({ israeliStocks: withUnpriced })
    );
    expect(stats.totalReturnPercent).toBeNull();
    expect(stats.hasHistory).toBe(false);
  });
});
