// Historical daily closes for multiple US tickers in one batched call, used
// by the frontend to compute the correlation matrix between holdings (see
// src/utils/correlationAnalysis.js). Public market data, same reasoning as
// benchmarkRoutes.js/sectorRoutes.js — no auth needed, cached aggressively
// since a historical close from yesterday doesn't change.
const { fetchYahooHistoricalCloses } = require('./yahooQuotes');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h, same as benchmarkRoutes.js
const cache = new Map();
const inFlight = new Map();
const MAX_SYMBOLS_PER_REQUEST = 30; // matches sectorRoutes.js's cap

function isValidDateString(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function getCachedHistory(symbol, fromDateStr) {
  const cacheKey = `${symbol}:${fromDateStr || 'default'}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const existingInFlight = inFlight.get(cacheKey);
  if (existingInFlight) return existingInFlight;

  const requestPromise = (async () => {
    try {
      const points = await fetchYahooHistoricalCloses(symbol, fromDateStr);
      cache.set(cacheKey, { data: points, ts: Date.now() });
      return points;
    } catch (err) {
      console.warn('[correlation] failed to fetch history', { symbol, error: err && err.message });
      // Same "fail this one symbol, not the whole batch" approach as
      // sectorRoutes.js — one delisted/renamed ticker shouldn't blank out
      // the correlation matrix for the rest of the portfolio.
      return [];
    }
  })();

  inFlight.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlight.delete(cacheKey);
  }
}

function mountCorrelationRoutes(app) {
  // POST (not GET) because the symbol list can be longer than is
  // comfortable in a query string — same reasoning as /api/stock-sectors.
  app.post('/api/stock-price-history', async (req, res) => {
    const body = req.body || {};
    const symbols = Array.isArray(body.symbols) ? body.symbols : [];
    const cleaned = [...new Set(symbols.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))].slice(
      0,
      MAX_SYMBOLS_PER_REQUEST
    );
    const from = isValidDateString(body.from) ? body.from : undefined;

    if (cleaned.length === 0) {
      return res.json({ history: {} });
    }

    const results = await Promise.all(cleaned.map((symbol) => getCachedHistory(symbol, from)));
    const history = {};
    cleaned.forEach((symbol, i) => {
      history[symbol] = results[i];
    });
    return res.json({ history });
  });
}

module.exports = { mountCorrelationRoutes };
