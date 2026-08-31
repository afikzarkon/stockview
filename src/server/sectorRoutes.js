// Sector/industry lookup for US stocks (via Yahoo's assetProfile module),
// used for the "diversification by sector" section. Public data, no user
// auth needed — same reasoning as benchmarkRoutes.js. Cached for a long
// time (a company's sector classification essentially never changes
// day-to-day) and batched: the frontend asks for many symbols at once
// instead of one request per holding.
const { fetchYahooAssetProfile } = require('./yahooQuotes');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const cache = new Map();
const inFlight = new Map();
const MAX_SYMBOLS_PER_REQUEST = 30; // matches realistic portfolio sizes; guards against abuse

async function getCachedSector(symbol) {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const existingInFlight = inFlight.get(symbol);
  if (existingInFlight) return existingInFlight;

  const requestPromise = (async () => {
    try {
      const data = await fetchYahooAssetProfile(symbol);
      cache.set(symbol, { data, ts: Date.now() });
      return data;
    } catch (err) {
      // Cache the failure too (shorter effect, since ts is still "now") -
      // an unknown/delisted symbol will keep failing, no reason to hit
      // Yahoo again for it on every portfolio-analysis view this hour.
      console.warn('[sectors] failed to resolve symbol', { symbol, error: err && err.message });
      const fallback = { sector: null, industry: null };
      cache.set(symbol, { data: fallback, ts: Date.now() });
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

function mountSectorRoutes(app) {
  // POST (not GET) because the symbol list can be longer than is
  // comfortable in a query string, and this isn't really "fetching a
  // resource by id" so much as "batch-resolve these tickers".
  app.post('/api/stock-sectors', async (req, res) => {
    const body = req.body || {};
    const symbols = Array.isArray(body.symbols) ? body.symbols : [];
    const cleaned = [...new Set(symbols.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))].slice(
      0,
      MAX_SYMBOLS_PER_REQUEST
    );

    if (cleaned.length === 0) {
      return res.json({ sectors: {} });
    }

    try {
      const results = await Promise.all(cleaned.map((symbol) => getCachedSector(symbol)));
      const sectors = {};
      cleaned.forEach((symbol, i) => {
        sectors[symbol] = results[i];
      });
      return res.json({ sectors });
    } catch (err) {
      console.error('[sectors] failed to resolve symbols', { symbols: cleaned, error: err && err.message });
      return res.status(502).json({ error: 'לא ניתן היה למשוך נתוני סקטור' });
    }
  });
}

module.exports = { mountSectorRoutes };
