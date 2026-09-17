// Historical daily closes for Israeli/American stocks and the USD/ILS
// exchange rate, batched per request - feeds the "historical portfolio
// value at date X" engine (src/utils/historicalPortfolioValue.js) behind
// the custom date-range filter in PortfolioAnalysisView.js. Same
// cache+inFlight+batch-size shape as sectorRoutes.js/dividendRoutes.js:
// successes cached longer than failures, concurrent requests for the
// same symbol share one in-flight promise, and a single bad symbol never
// fails the whole batch (its slot just comes back as an empty array).
const { fetchTaseHistoricalCloses } = require('./taseHistoryApi');
const { fetchYahooHistoricalCloses } = require('./yahooQuotes');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // a past trading day's close never changes
const FAILURE_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_SYMBOLS_PER_REQUEST = 30;

function errMessage(err) {
  if (!err) return 'unknown error';
  return err.message || String(err);
}

// One cache+inFlight pair per underlying data source (Israeli/American/FX
// all key their cache independently, even though FX reuses the same
// fetch function as American symbols) - a factory so the three don't
// share state with each other.
function createHistoryCache(fetchFn) {
  const cache = new Map(); // `${symbol}:${from}` -> { data, ts, isFailure }
  const inFlight = new Map();

  async function getCachedHistory(symbol, from) {
    const key = `${symbol}:${from || 'default'}`;
    const cached = cache.get(key);
    if (cached) {
      const ttl = cached.isFailure ? FAILURE_CACHE_TTL_MS : CACHE_TTL_MS;
      if (Date.now() - cached.ts < ttl) return cached.data;
    }

    const existing = inFlight.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const data = await fetchFn(symbol, from);
        cache.set(key, { data, ts: Date.now(), isFailure: false });
        return data;
      } catch (err) {
        console.warn('[historical-prices] fetch failed', { symbol, from, error: errMessage(err) });
        const fallback = [];
        cache.set(key, { data: fallback, ts: Date.now(), isFailure: true });
        return fallback;
      }
    })();
    inFlight.set(key, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(key);
    }
  }

  return { getCachedHistory };
}

function normalizeSymbols(rawSymbols, transform) {
  if (!Array.isArray(rawSymbols)) return [];
  const cleaned = rawSymbols
    .map((s) => (typeof s === 'string' || typeof s === 'number' ? String(s).trim() : ''))
    .filter(Boolean)
    .map(transform);
  return [...new Set(cleaned)].slice(0, MAX_SYMBOLS_PER_REQUEST);
}

function mountHistoricalPricesRoutes(app) {
  const israeliCache = createHistoryCache(fetchTaseHistoricalCloses);
  const americanCache = createHistoryCache(fetchYahooHistoricalCloses);
  const fxCache = createHistoryCache(fetchYahooHistoricalCloses);

  app.post('/api/israeli-stocks-history', async (req, res) => {
    const symbols = normalizeSymbols(req.body && req.body.symbols, (s) => s);
    const from = typeof (req.body && req.body.from) === 'string' ? req.body.from : undefined;
    if (symbols.length === 0) return res.json({ history: {} });

    const results = await Promise.all(symbols.map((s) => israeliCache.getCachedHistory(s, from)));
    const history = {};
    symbols.forEach((s, i) => {
      history[s] = results[i];
    });
    return res.json({ history });
  });

  app.post('/api/american-stocks-history', async (req, res) => {
    const symbols = normalizeSymbols(req.body && req.body.symbols, (s) => s.toUpperCase());
    const from = typeof (req.body && req.body.from) === 'string' ? req.body.from : undefined;
    if (symbols.length === 0) return res.json({ history: {} });

    const results = await Promise.all(symbols.map((s) => americanCache.getCachedHistory(s, from)));
    const history = {};
    symbols.forEach((s, i) => {
      history[s] = results[i];
    });
    return res.json({ history });
  });

  // Single series, not batched (there's only one exchange rate) - powers
  // the ILS conversion of each historical American holding value.
  app.get('/api/exchange-rate-history', async (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const history = await fxCache.getCachedHistory('USDILS=X', from);
    return res.json({ history });
  });
}

module.exports = { mountHistoricalPricesRoutes };
