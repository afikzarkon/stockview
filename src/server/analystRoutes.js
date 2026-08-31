// Analyst coverage for US stocks: consensus rating, price targets, and
// recent upgrade/downgrade history — via the same Yahoo quoteSummary
// endpoint already used for sector data (sectorRoutes.js), so it shares
// the same crumb/cookie auth (yahooCrumb.js) and the same batched-POST +
// per-symbol-cache shape. Public data, no user auth needed.
const { fetchYahooAnalystData } = require('./yahooQuotes');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h for resolved data: analyst consensus doesn't move minute to minute
const FAILURE_CACHE_TTL_MS = 5 * 60 * 1000; // 5min for a failed lookup - see sectorRoutes.js for why
const cache = new Map();
const inFlight = new Map();
const MAX_SYMBOLS_PER_REQUEST = 30;

async function getCachedAnalystData(symbol) {
  const cached = cache.get(symbol);
  if (cached) {
    const ttl = cached.isFailure ? FAILURE_CACHE_TTL_MS : CACHE_TTL_MS;
    if (Date.now() - cached.ts < ttl) return cached.data;
  }

  const existingInFlight = inFlight.get(symbol);
  if (existingInFlight) return existingInFlight;

  const requestPromise = (async () => {
    try {
      const data = await fetchYahooAnalystData(symbol);
      cache.set(symbol, { data, ts: Date.now(), isFailure: false });
      return data;
    } catch (err) {
      console.warn('[analyst] failed to resolve symbol', { symbol, error: err && err.message });
      const fallback = {
        recommendationKey: null,
        numberOfAnalystOpinions: null,
        targetMeanPrice: null,
        targetHighPrice: null,
        targetLowPrice: null,
        currentTrend: null,
        upgradeHistory: []
      };
      cache.set(symbol, { data: fallback, ts: Date.now(), isFailure: true });
      return fallback;
    }
  })();

  inFlight.set(symbol, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlight.delete(symbol);
  }
}

function mountAnalystRoutes(app) {
  app.post('/api/analyst-recommendations', async (req, res) => {
    const body = req.body || {};
    const symbols = Array.isArray(body.symbols) ? body.symbols : [];
    const cleaned = [...new Set(symbols.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))].slice(
      0,
      MAX_SYMBOLS_PER_REQUEST
    );

    if (cleaned.length === 0) {
      return res.json({ recommendations: {} });
    }

    try {
      const results = await Promise.all(cleaned.map((symbol) => getCachedAnalystData(symbol)));
      const recommendations = {};
      cleaned.forEach((symbol, i) => {
        recommendations[symbol] = results[i];
      });
      return res.json({ recommendations });
    } catch (err) {
      console.error('[analyst] failed to resolve symbols', { symbols: cleaned, error: err && err.message });
      return res.status(502).json({ error: 'לא ניתן היה למשוך נתוני אנליסטים' });
    }
  });
}

module.exports = { mountAnalystRoutes };
