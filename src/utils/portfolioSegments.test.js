import {
  MARKET_SEGMENTS,
  FX_MODES,
  DEFAULT_SEGMENT,
  DEFAULT_FX_MODE,
  segmentSupportsFxToggle,
  resolveFxMode,
  selectSegmentHoldings,
  isSegmentEmpty,
  describeSelection,
  benchmarksForSegment,
  resolveBenchmarkForSegment,
  benchmarkCurrency,
  BENCHMARKS_BY_SEGMENT
} from './portfolioSegments';
import { computePortfolioValueAtDate } from './historicalPortfolioValue';
import { buildSeriesFromHistoricalValues, computeStatsFromSeries } from './portfolioStats';
import { buildPortfolioCashFlows } from './portfolioCashFlows';

const holdings = {
  israeliStocks: [{ stockName: 'TEVA', quantity: 100, purchasePrice: 30, purchaseDate: '2022-01-03' }],
  americanStocks: [
    { stockName: 'AAPL', quantity: 10, purchasePrice: 150, exchangeRate: 3.5, purchaseDate: '2022-01-03' }
  ],
  pensionFunds: [{ id: 1, currentValue: 12000, currentValueDate: '2024-01-03' }],
  cashFunds: [{ id: 2, currentValue: 5000, currentValueDate: '2024-01-03' }],
  bankBalances: [{ id: 3, amount: 20000, updateDate: '2024-01-03' }],
  bankSavingsFunds: [{ id: 4, deposits: [{ date: '2022-01-03', amount: 1000 }], interestRate: 3 }]
};

describe('selectSegmentHoldings', () => {
  test('equities across both markets is the default, and nothing else is included', () => {
    expect(DEFAULT_SEGMENT).toBe('all');
    const selected = selectSegmentHoldings(holdings, DEFAULT_SEGMENT);
    expect(selected.israeliStocks).toHaveLength(1);
    expect(selected.americanStocks).toHaveLength(1);
    expect(selected.pensionFunds).toEqual([]);
    expect(selected.cashFunds).toEqual([]);
    expect(selected.bankBalances).toEqual([]);
    expect(selected.bankSavingsFunds).toEqual([]);
  });

  test('the Israeli segment carries no American lots, and vice versa', () => {
    expect(selectSegmentHoldings(holdings, 'israeli').americanStocks).toEqual([]);
    expect(selectSegmentHoldings(holdings, 'israeli').israeliStocks).toHaveLength(1);
    expect(selectSegmentHoldings(holdings, 'american').israeliStocks).toEqual([]);
    expect(selectSegmentHoldings(holdings, 'american').americanStocks).toHaveLength(1);
  });

  // There is no longer a mode that puts them back: a net-worth return is a
  // different question from an investment return, and the chart answers
  // only the second.
  test('no segment can pull the non-equity accounts into the chart', () => {
    ['all', 'israeli', 'american'].forEach((segment) => {
      const selected = selectSegmentHoldings(holdings, segment);
      ['pensionFunds', 'cashFunds', 'bankBalances', 'bankSavingsFunds'].forEach((key) => {
        expect(selected[key]).toEqual([]);
      });
    });
  });

  // Every consumer takes the same holdings shape, so an excluded category
  // is an empty list rather than an absent key - no caller has to guard.
  test('always returns a complete holdings shape, never a partial one', () => {
    const keys = Object.keys(selectSegmentHoldings(holdings, 'israeli')).sort();
    expect(keys).toEqual(
      ['americanStocks', 'bankBalances', 'bankSavingsFunds', 'cashFunds', 'israeliStocks', 'pensionFunds'].sort()
    );
  });

  test('tolerates a missing or empty holdings object', () => {
    expect(() => selectSegmentHoldings()).not.toThrow();
    expect(isSegmentEmpty(selectSegmentHoldings({}))).toBe(true);
  });

  test('reports an empty selection, so the UI can name the filter responsible', () => {
    expect(isSegmentEmpty(selectSegmentHoldings(holdings, 'all'))).toBe(false);
    const israeliOnly = { israeliStocks: holdings.israeliStocks };
    expect(isSegmentEmpty(selectSegmentHoldings(israeliOnly, 'american'))).toBe(true);
  });
});

describe('non-equity assets never reach the return', () => {
  const closes = {
    taseHistoricalCloses: {
      TEVA: [
        { date: '2022-01-03', close: 3000 },
        { date: '2024-01-03', close: 6000 }
      ]
    }
  };
  const dates = ['2022-01-03', '2024-01-03'];

  // Held from before the measured period, so it would sit in BOTH ends of
  // every sub-period and drag the percentage down - if it were included.
  const bankHeldThroughout = [{ id: 3, amount: 20000, updateDate: '2021-01-01' }];

  test('a doubled holding reports +100%, undiluted by a large idle balance', () => {
    const selected = selectSegmentHoldings(
      { israeliStocks: holdings.israeliStocks, bankBalances: bankHeldThroughout },
      'all'
    );
    const series = dates.map((d) =>
      computePortfolioValueAtDate(d, selected, closes, { anchorLedgerAccountsToFirstRecord: true })
    );
    const stats = computeStatsFromSeries(
      buildSeriesFromHistoricalValues(series),
      buildPortfolioCashFlows({ ...selected, includeLedgerOpeningBalances: true })
    );
    expect(stats.totalReturnPercent).toBeCloseTo(100, 1);
  });
});

describe('cash-flow isolation between markets', () => {
  // The whole point of segmentation: a US purchase must not appear as a
  // contribution to be netted out of an Israeli sub-period, where the money
  // never went.
  test('an Israeli selection produces no American purchase flows', () => {
    const flows = buildPortfolioCashFlows(selectSegmentHoldings(holdings, 'israeli'));
    expect(flows).toEqual([{ date: '2022-01-03', amount: 3000 }]); // 30 x 100
  });

  test('an American selection produces no Israeli purchase flows', () => {
    const flows = buildPortfolioCashFlows(selectSegmentHoldings(holdings, 'american'));
    // 150 x 10 at the rate actually paid (3.5), not today's.
    expect(flows).toEqual([{ date: '2022-01-03', amount: 5250 }]);
  });

  test('the combined selection carries both', () => {
    const total = buildPortfolioCashFlows(selectSegmentHoldings(holdings, 'all')).reduce(
      (sum, f) => sum + f.amount,
      0
    );
    expect(total).toBeCloseTo(3000 + 5250, 5);
  });

  // The chart holds no ledger accounts at all now, so no opening balance
  // can leak into an equity return even with the option switched on.
  test('no ledger opening balance reaches a segment selection', () => {
    const flows = buildPortfolioCashFlows({
      ...selectSegmentHoldings(holdings, 'all'),
      includeLedgerOpeningBalances: true
    });
    expect(flows.some((f) => f.amount === 20000)).toBe(false);
  });
});

describe('benchmarks per segment', () => {
  test('each market offers its own indices', () => {
    expect(benchmarksForSegment('israeli').map((b) => b.key)).toEqual(['ta125', 'ta35', 'ta90', 'taBanks']);
    expect(benchmarksForSegment('american').map((b) => b.key)).toEqual([
      'sp500',
      'nasdaq',
      'nasdaq100',
      'russell2000'
    ]);
    expect(benchmarksForSegment('all').map((b) => b.key)).toContain('sp500');
    expect(benchmarksForSegment('all').map((b) => b.key)).toContain('ta125');
  });

  test('an unknown segment falls back to the combined list rather than to nothing', () => {
    expect(benchmarksForSegment('nonsense')).toEqual(BENCHMARKS_BY_SEGMENT.all);
  });

  // Every TASE index is quoted in shekels and every US one in dollars; the
  // flag is what decides whether a series gets FX-converted.
  test('every benchmark declares the currency it is quoted in', () => {
    Object.values(BENCHMARKS_BY_SEGMENT)
      .flat()
      .forEach((b) => expect(['ILS', 'USD']).toContain(b.currency));
    expect(benchmarkCurrency('israeli', 'ta125')).toBe('ILS');
    expect(benchmarkCurrency('american', 'sp500')).toBe('USD');
  });

  // TA-Banks is offered again now that the Israeli indices come from
  // TASE rather than Yahoo, which served a quote for it but only one
  // historical point - see server/taseIndexHistoryApi.js.
  test('TA-Banks is offered, sourced from TASE rather than Yahoo', () => {
    const allKeys = Object.values(BENCHMARKS_BY_SEGMENT).flat().map((b) => b.key);
    expect(allKeys).toContain('taBanks');
    expect(benchmarkCurrency('israeli', 'taBanks')).toBe('ILS');
  });
});

describe('resolveBenchmarkForSegment', () => {
  // Switching market should not silently reset a comparison the user set
  // up, when the new market offers the same index.
  test('keeps the chosen index when the new segment also offers it', () => {
    expect(resolveBenchmarkForSegment('american', 'sp500')).toBe('sp500');
    expect(resolveBenchmarkForSegment('all', 'sp500')).toBe('sp500');
    expect(resolveBenchmarkForSegment('israeli', 'ta125')).toBe('ta125');
  });

  test('falls back to that market primary anchor when it does not', () => {
    expect(resolveBenchmarkForSegment('israeli', 'sp500')).toBe('ta125');
    expect(resolveBenchmarkForSegment('american', 'ta90')).toBe('sp500');
  });

  test('never returns undefined, whatever it is given', () => {
    expect(resolveBenchmarkForSegment('israeli', undefined)).toBeTruthy();
    expect(resolveBenchmarkForSegment('nonsense', 'nonsense')).toBeTruthy();
  });
});

describe('describeSelection', () => {
  test('names the market and says the chart is equities only', () => {
    expect(describeSelection('israeli', DEFAULT_FX_MODE)).toContain('בורסה ישראלית');
    expect(describeSelection('israeli', DEFAULT_FX_MODE)).toContain('מניות בלבד');
  });

  // The same dates carry different figures under the two modes, so the
  // description has to say which basis is in force.
  test('states the currency basis for the US view, and only for it', () => {
    expect(describeSelection('american', FX_MODES.PURE_USD)).toContain('דולרית');
    expect(describeSelection('american', FX_MODES.HISTORICAL)).toContain('שער החליפין');
    // No FX wording where there is no FX to speak of.
    expect(describeSelection('israeli', FX_MODES.PURE_USD)).not.toContain('שער');
  });
});

test('the market toggle exposes the options the UI renders', () => {
  expect(MARKET_SEGMENTS.map((s) => s.key)).toEqual(['all', 'israeli', 'american']);
  MARKET_SEGMENTS.forEach((option) => {
    expect(option.label).toBeTruthy();
    expect(option.hint).toBeTruthy();
  });
});

describe('FX mode', () => {
  test('defaults to the pure dollar return', () => {
    expect(DEFAULT_FX_MODE).toBe(FX_MODES.PURE_USD);
  });

  // An Israeli holding has no exchange rate inside it, and the combined
  // view is the whole-portfolio picture, which should carry the currency.
  test('is offered only for the US view', () => {
    expect(segmentSupportsFxToggle('american')).toBe(true);
    expect(segmentSupportsFxToggle('israeli')).toBe(false);
    expect(segmentSupportsFxToggle('all')).toBe(false);
  });

  test('a request to exclude FX is ignored where there is no FX to exclude', () => {
    expect(resolveFxMode('american', FX_MODES.PURE_USD)).toBe(FX_MODES.PURE_USD);
    expect(resolveFxMode('israeli', FX_MODES.PURE_USD)).toBe(FX_MODES.HISTORICAL);
    expect(resolveFxMode('all', FX_MODES.PURE_USD)).toBe(FX_MODES.HISTORICAL);
  });
});

// The US view's headline question: did my American stocks go up, or did
// the dollar? The two answers differ, and each is right for one question.
describe('pure-dollar valuation for the US segment', () => {
  const americanStocks = [
    { stockName: 'AAPL', quantity: 10, purchasePrice: 100, exchangeRate: 4, purchaseDate: '2022-01-03' }
  ];
  const closes = {
    yahooHistoricalCloses: {
      AAPL: [
        { date: '2022-01-03', close: 100 },
        { date: '2024-01-03', close: 150 } // +50% in dollars
      ]
    },
    // Meanwhile the dollar fell from 4 to 3 - a 25% currency loss.
    fxHistoricalCloses: [
      { date: '2022-01-03', close: 4 },
      { date: '2024-01-03', close: 3 }
    ]
  };
  const dates = ['2022-01-03', '2024-01-03'];

  const returnFor = (americanExchangeRate) => {
    const selected = selectSegmentHoldings({ americanStocks }, 'american');
    const series = dates.map((d) =>
      computePortfolioValueAtDate(d, selected, closes, { americanExchangeRate })
    );
    return computeStatsFromSeries(
      buildSeriesFromHistoricalValues(series),
      buildPortfolioCashFlows({ ...selected, americanExchangeRate })
    ).totalReturnPercent;
  };

  test('at one fixed rate the return is the dollar return, currency removed', () => {
    expect(returnFor(3)).toBeCloseTo(50, 5);
  });

  // The choice of constant sets only the SCALE the curve is drawn on, not
  // the return - which is why taking the app's current rate is safe.
  test('any fixed rate gives the same return, only a different scale', () => {
    expect(returnFor(3)).toBeCloseTo(returnFor(4), 5);
    expect(returnFor(3)).toBeCloseTo(returnFor(11.7), 5);
  });

  test('a fixed rate still expresses the values in shekels', () => {
    const selected = selectSegmentHoldings({ americanStocks }, 'american');
    const last = computePortfolioValueAtDate('2024-01-03', selected, closes, {
      americanExchangeRate: 3
    });
    expect(last.valueILS).toBeCloseTo(10 * 150 * 3, 5); // ILS, not USD
  });

  // At historical rates the same holding earned +50% in dollars while the
  // dollar lost 25%, so the shekel investor made about 12.5%.
  test('at historical rates the currency move is part of the answer', () => {
    expect(returnFor(null)).toBeCloseTo(12.5, 1);
  });

  // The day-0 anchor uses the lot's own purchase rate, and leaving that as
  // the rate actually paid would strand one FX move at the very start of
  // the series, where no earlier point exists to net it against.
  test('the day-0 cost basis is converted at the fixed rate too', () => {
    const selected = selectSegmentHoldings({ americanStocks }, 'american');
    const first = computePortfolioValueAtDate('2022-01-03', selected, closes, {
      americanExchangeRate: 3
    });
    // Cost basis 100 x 10, at the fixed 3 - not at the 4 that was paid.
    expect(first.valueILS).toBeCloseTo(3000, 5);
  });

  // The contribution and the value change it caused must be in the same
  // money, or the difference survives as a phantom gain.
  test('the purchase flow is recorded at the same fixed rate', () => {
    const selected = selectSegmentHoldings({ americanStocks }, 'american');
    expect(buildPortfolioCashFlows({ ...selected, americanExchangeRate: 3 })).toEqual([
      { date: '2022-01-03', amount: 3000 }
    ]);
    // Without a fixed rate it stays at the rate actually paid.
    expect(buildPortfolioCashFlows(selected)).toEqual([{ date: '2022-01-03', amount: 4000 }]);
  });

  test('an invalid or missing rate falls back to historical rates', () => {
    expect(returnFor(0)).toBeCloseTo(returnFor(null), 5);
    expect(returnFor(NaN)).toBeCloseTo(returnFor(null), 5);
  });
});
