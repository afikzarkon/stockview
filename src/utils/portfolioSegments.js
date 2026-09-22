// Which holdings a performance figure is actually about.
//
// WHY THIS EXISTS
// ---------------
// "How is my portfolio doing?" is not one question. A return computed over
// everything the user owns answers it for their net worth, and that is the
// wrong answer for almost every use the chart is put to: money sitting in a
// current account, a provident fund and a bank deposit does not move with
// the market, but it is in both the numerator and the denominator of every
// sub-period, so it drags each percentage toward zero. A holding that
// doubled next to an equal balance of idle cash reads as +50%, and the
// investor never learns what their stock picking did.
//
// So the performance engine takes a SEGMENT - which market - and values
// the equities in it, and only those. There is no "include everything"
// mode: a net-worth return is a different question from an investment
// return, and offering the two side by side under one chart invited
// reading one as the other. The balance-sheet figures live on the home
// dashboard, where nothing labels them performance.
//
// Cash-flow isolation falls out of the same selection for free: flows are
// built from the same holdings object, so a segment that contains no
// American lots produces no American purchase flows, and a US purchase can
// never perturb a sub-period of the Israeli curve.

import { effectiveExchangeForIsraeliStock } from './israeliEtfClassifier';

// Equity segments. `all` is both markets together.
//
// The two market segments are about EXPOSURE, not about where a security
// happens to be listed - see selectSegmentHoldings. A TASE-listed tracker
// of a foreign index counts under the foreign one.
export const MARKET_SEGMENTS = [
  { key: 'all', label: 'כלל המניות', hint: 'מניות ישראליות ואמריקאיות יחד' },
  {
    key: 'israeli',
    label: 'בורסה ישראלית',
    hint: 'חשיפה לשוק הישראלי בלבד - קרנות סל העוקבות אחרי מדדי חו"ל אינן נכללות'
  },
  {
    key: 'american',
    label: 'בורסה אמריקאית',
    hint: 'חשיפה לשוק האמריקאי - כולל קרנות סל הנסחרות בתל אביב שעוקבות אחרי מדדי חו"ל'
  }
];

export const DEFAULT_SEGMENT = 'all';

// FX TREATMENT FOR THE AMERICAN SIDE.
//
// A US holding earns its return in dollars, and an Israeli investor
// experiences that return plus whatever the shekel did. Those are two
// different questions, and one curve can only answer one of them:
//
//   'usd'        - the dollar return alone. Every date is converted at ONE
//                  rate, so the currency cancels out of every ratio and
//                  what is left is the asset's own performance. Amounts
//                  are still shown in shekels (at that single rate),
//                  because the rest of the app is in shekels and a chart
//                  that silently changed currency under a toggle would be
//                  worse than one whose scale is stated.
//   'historical' - each date at its own rate: what the holdings were
//                  really worth in shekels that day, currency move
//                  included.
//
// Offered wherever there are American holdings for it to act on - the US
// view and the combined one. An Israeli-only curve has no exchange rate
// inside it, so there the toggle is hidden rather than shown doing nothing.
//
// The combined view is where the question is usually asked ("how much of
// my year was the dollar?"), and it is answerable there precisely because
// the Israeli side is unaffected: switching the toggle moves only the
// American contribution, so the difference between the two curves IS the
// currency's effect on the whole stock portfolio.
export const FX_MODES = { PURE_USD: 'usd', HISTORICAL: 'historical' };

export const DEFAULT_FX_MODE = FX_MODES.PURE_USD;

export const segmentSupportsFxToggle = (segment) => segment === 'american' || segment === 'all';

// What a segment shows before the user touches the toggle, which is not the
// same answer for both.
//
// The combined view is the whole-portfolio headline, so it opens on what
// the holdings were really worth in the currency their owner spends -
// currency move included. The US view opens on the dollar return alone,
// which is what isolates the stock picking from the exchange rate. Each
// default is the question its own view is usually opened to answer.
export const defaultFxModeForSegment = (segment) =>
  segment === 'all' ? FX_MODES.HISTORICAL : DEFAULT_FX_MODE;

// The mode actually in force, which is not always the one requested: a
// segment with no American holdings in it has no FX to include or exclude.
export const resolveFxMode = (segment, requestedMode) =>
  segmentSupportsFxToggle(segment) ? requestedMode : FX_MODES.HISTORICAL;

// The non-equity account categories, named so they can be explicitly
// emptied rather than silently omitted.
//
// All four are ILS-denominated and none has a market price: a provident
// fund and a money-market fund carry a recorded value, a current account
// carries a balance, and a bank savings fund compounds its own deposits at
// a stated rate. They are real wealth, and they are not equity performance.
const NON_EQUITY_KEYS = ['pensionFunds', 'cashFunds', 'bankBalances', 'bankSavingsFunds'];

const EMPTY = Object.freeze([]);

// The equity holdings a segment covers.
//
// Returns the same shape computePortfolioValueAtDate and
// buildPortfolioCashFlows both take, with the non-equity categories
// explicitly emptied rather than removed - so every consumer sees a
// complete, well-formed holdings object and no caller has to remember
// which keys might be absent.
export const selectSegmentHoldings = (holdings = {}, segment = DEFAULT_SEGMENT) => {
  const israeliListed = holdings.israeliStocks || EMPTY;
  const americanListed = holdings.americanStocks || EMPTY;

  // WHERE IT TRADES IS NOT WHICH MARKET IT IS EXPOSED TO.
  //
  // A TASE-listed S&P 500 tracker is an Israeli security by listing and an
  // American holding by everything that moves it. Counted as Israeli, it
  // put Wall Street's returns inside the Tel Aviv curve - so "how did my
  // Israeli equities do" was answered partly by the S&P, and the two
  // markets could not be told apart at all. effectiveExchangeForIsraeliStock
  // is the same classification the dashboard's pie and the sector
  // breakdown already use; this brings the performance segments in line
  // with it.
  //
  // The split is by SEGMENT MEMBERSHIP only. A reclassified holding stays
  // in the israeliStocks key, because that is what decides how it is
  // priced - it is quoted in agorot on TASE and has no Yahoo ticker or
  // exchange rate, and moving it to americanStocks would send it to the
  // wrong price source entirely.
  //
  // One honest limitation: under the pure-dollar FX mode the American side
  // is converted at a single fixed rate to cancel the currency out. That
  // cannot be done for these - their shekel price already contains the
  // currency move, and the underlying dollar NAV is not something the app
  // holds. So a US-segment curve including them still carries some FX in
  // that mode.
  const exposureOf = (stock) => effectiveExchangeForIsraeliStock(stock);
  const israeliStocksForSegment =
    segment === 'all'
      ? israeliListed
      : israeliListed.filter((stock) => exposureOf(stock) === segment);

  const selected = {
    israeliStocks: israeliStocksForSegment,
    americanStocks: segment === 'all' || segment === 'american' ? americanListed : EMPTY
  };
  NON_EQUITY_KEYS.forEach((key) => {
    selected[key] = EMPTY;
  });
  return selected;
};

// True when the selection contains nothing at all - so the UI can say which
// filter emptied the chart instead of showing a blank one.
export const isSegmentEmpty = (selected = {}) =>
  Object.values(selected).every((list) => !Array.isArray(list) || list.length === 0);

// A short description of what the curve currently covers, for the chart's
// subtitle and for the inspection panel - which must say which basis its
// rows are on, since the same dates carry different figures under the two
// FX modes.
export const describeSelection = (segment, fxMode) => {
  const market = MARKET_SEGMENTS.find((s) => s.key === segment)?.label || '';
  const base = `${market} - מניות בלבד`;
  if (!segmentSupportsFxToggle(segment)) return base;
  return resolveFxMode(segment, fxMode) === FX_MODES.PURE_USD
    ? `${base}, תשואה דולרית (ללא השפעת שער החליפין)`
    : `${base}, כולל השפעת שער החליפין`;
};

// BENCHMARKS PER SEGMENT
// ----------------------
// Which indices it makes sense to compare a segment against. An Israeli
// equity curve measured against the S&P 500 is a currency-and-market
// mismatch dressed up as a comparison, so each market offers its own.
//
// `currency` is what the index is QUOTED in, and it is load-bearing: a USD
// index has to be converted to shekels at each date's rate before it can be
// compared with an ILS portfolio, or the comparison silently omits the
// FX move the investor actually experienced (see
// convertBenchmarkPointsToILS in benchmarkComparison.js).
//
// The Israeli indices come from TASE's own index endpoint rather than from
// Yahoo, which is what makes TA-Banks possible at all: Yahoo answers for
// TA-BANKS.TA with a current quote and exactly one historical point at
// every range from six months to five years, so a line could never be
// drawn from it. TASE returns 738 trading days for the same index. See
// server/taseIndexHistoryApi.js.
export const BENCHMARKS_BY_SEGMENT = {
  israeli: [
    { key: 'ta125', label: 'תל אביב 125', currency: 'ILS' },
    { key: 'ta35', label: 'תל אביב 35', currency: 'ILS' },
    { key: 'ta90', label: 'תל אביב 90', currency: 'ILS' },
    { key: 'taBanks', label: 'תל אביב בנקים', currency: 'ILS' }
  ],
  american: [
    { key: 'sp500', label: 'S&P 500', currency: 'USD' },
    { key: 'nasdaq', label: 'NASDAQ Composite', currency: 'USD' },
    { key: 'nasdaq100', label: 'NASDAQ 100', currency: 'USD' },
    { key: 'russell2000', label: 'Russell 2000', currency: 'USD' }
  ],
  // A portfolio spanning both markets has no single natural index, so it
  // gets the primary anchor of each rather than a manufactured blend: a
  // weighted composite would need the user's own market split as its
  // weights, and would then move when they rebalanced, which is precisely
  // the thing a benchmark must not do.
  all: [
    { key: 'sp500', label: 'S&P 500', currency: 'USD' },
    { key: 'ta125', label: 'תל אביב 125', currency: 'ILS' },
    { key: 'nasdaq', label: 'NASDAQ Composite', currency: 'USD' }
  ]
};

export const benchmarksForSegment = (segment) =>
  BENCHMARKS_BY_SEGMENT[segment] || BENCHMARKS_BY_SEGMENT.all;

// The benchmark to show for a segment, preserving the user's choice when
// the new segment also offers it (switching scope, or moving between two
// segments that share an index, should not silently reset the comparison).
export const resolveBenchmarkForSegment = (segment, currentKey) => {
  const options = benchmarksForSegment(segment);
  return options.some((b) => b.key === currentKey) ? currentKey : options[0].key;
};

export const benchmarkCurrency = (segment, key) =>
  benchmarksForSegment(segment).find((b) => b.key === key)?.currency || 'ILS';
