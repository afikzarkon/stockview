// Assembles everything the valuation page needs for one symbol: current and
// historical multiples against peers, and the inputs for the (client-side)
// DCF calculator. Cached per symbol; the sources are injected so tests run
// on fixtures.
const { historicalMultiples, buildMultiplesTable, trailingTwelveMonths, fcfOf } = require('../shared/valuationMultiples');

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 5 * 60 * 1000;
const MAX_PEERS = 5;
const DEFAULT_RISK_FREE = 0.043;

const latest = (rows, key) => {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(rows[i][key])) return rows[i][key];
  }
  return null;
};

function createValuationService({ sources, now = () => new Date(), logger = console }) {
  const cache = new Map();
  const inFlight = new Map();

  async function build(symbol) {
    const [summary, statements, prices] = await Promise.all([
      sources.summary(symbol),
      sources.statements(symbol),
      sources.monthlyPrices(symbol)
    ]);
    const [riskFreeRate, peers] = await Promise.all([
      sources.riskFreeRate().catch(() => null),
      (async () => {
        try {
          const symbols = (await sources.peerSymbols(symbol)).filter((s) => s.toUpperCase() !== symbol).slice(0, MAX_PEERS);
          const out = [];
          for (const peer of symbols) {
            try {
              out.push(Object.assign({ symbol: peer }, sources.peerMultiples(await sources.summary(peer))));
            } catch (err) {
              logger.warn && logger.warn('[valuation] peer failed', peer, err && err.message);
            }
          }
          return out;
        } catch {
          return [];
        }
      })()
    ]);

    const annual = statements.annual || [];
    const quarterly = statements.quarterly || [];
    const ttm = trailingTwelveMonths(quarterly) || annual[annual.length - 1] || {};
    const today = now().toISOString().slice(0, 10);
    const fromDate = `${Number(today.slice(0, 4)) - 5}${today.slice(4)}`;
    const history = historicalMultiples({ annual, splits: prices.splits, monthlyCloses: prices.closes, fromDate });
    const multiples = buildMultiplesTable({ current: { marketCap: summary.marketCap, ttm }, history, peers });

    const warnings = [];
    if (summary.financialCurrency && summary.currency && summary.financialCurrency !== summary.currency) {
      warnings.push(`הדוחות הכספיים מדווחים ב-${summary.financialCurrency} והמניה נסחרת ב-${summary.currency} - שווי ה-DCF למניה יוצא ב-${summary.financialCurrency}.`);
    }
    if (annual.length < 3) warnings.push(`נמצאו רק ${annual.length} שנות דוחות.`);

    const fcfHistory = annual.slice(-5).map((y) => ({ periodEnd: y.periodEnd, fcf: fcfOf(y) })).filter((x) => Number.isFinite(x.fcf));
    return {
      symbol,
      name: summary.name,
      sector: summary.sector,
      industry: summary.industry,
      currency: summary.currency,
      financialCurrency: summary.financialCurrency,
      price: summary.price,
      marketCap: summary.marketCap,
      multiples,
      historySamples: history.samples,
      fiscalYears: annual.slice(-6),
      peers,
      dcfInputs: {
        fcfHistory,
        cash: latest(quarterly, 'cashAndShortTerm') ?? latest(annual, 'cashAndShortTerm') ?? summary.totalCash ?? 0,
        debt: latest(quarterly, 'totalDebt') ?? latest(annual, 'totalDebt') ?? summary.totalDebt ?? 0,
        sharesDiluted: latest(quarterly, 'dilutedShares') ?? summary.sharesOutstanding ?? latest(annual, 'dilutedShares'),
        marketPrice: summary.price,
        beta: summary.beta,
        analystGrowth5y: summary.analystGrowth5y,
        riskFreeRate: riskFreeRate ?? DEFAULT_RISK_FREE,
        riskFreeRateIsDefault: riskFreeRate === null
      },
      warnings,
      sources: { statements: statements.source, prices: 'yahoo', peers: 'yahoo' },
      asOf: now().toISOString()
    };
  }

  async function getValuation(symbol) {
    const cached = cache.get(symbol);
    if (cached && now().getTime() - cached.ts < (cached.error ? FAILURE_TTL_MS : CACHE_TTL_MS)) {
      if (cached.error) throw cached.error;
      return cached.data;
    }
    if (inFlight.has(symbol)) return inFlight.get(symbol);
    const p = build(symbol)
      .then((data) => {
        cache.set(symbol, { data, ts: now().getTime() });
        return data;
      })
      .catch((err) => {
        cache.set(symbol, { error: err, ts: now().getTime() });
        throw err;
      })
      .finally(() => inFlight.delete(symbol));
    inFlight.set(symbol, p);
    return p;
  }

  return { getValuation, build };
}

function createDefaultSources(env = process.env) {
  const f = require('./fundamentals');
  return {
    summary: f.fetchValuationSummary,
    statements: env.FMP_API_KEY ? (symbol) => f.fetchFmpStatements(symbol, env.FMP_API_KEY) : (symbol) => f.fetchYahooStatements(symbol),
    monthlyPrices: (symbol) => f.fetchMonthlyPrices(symbol),
    peerSymbols: (symbol) => f.fetchPeerSymbols(symbol),
    peerMultiples: f.peerMultiples,
    riskFreeRate: () => f.fetchRiskFreeRate()
  };
}

module.exports = { createValuationService, createDefaultSources };
