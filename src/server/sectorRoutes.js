// Sector/industry lookup for US stocks (via Yahoo's assetProfile module),
// used for the "diversification by sector" section. Public data, no user
// auth needed — same reasoning as benchmarkRoutes.js. Cached for a long
// time (a company's sector classification essentially never changes
// day-to-day) and batched: the frontend asks for many symbols at once
// instead of one request per holding.
const { fetchYahooAssetProfile } = require('./yahooQuotes');
const { createSymbolCache } = require('./symbolCache');

// 24h: a company's sector classification essentially never changes day
// to day, which is also why a stale one is worth far more than a null -
// see symbolCache.js.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SYMBOLS_PER_REQUEST = 30; // matches realistic portfolio sizes; guards against abuse

const sectorCache = createSymbolCache({
  name: 'sectors',
  ttlMs: CACHE_TTL_MS,
  fetchOne: fetchYahooAssetProfile,
  fallback: () => ({ sector: null, industry: null })
});

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
      const results = await Promise.all(cleaned.map((symbol) => sectorCache.get(symbol)));
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

module.exports = { mountSectorRoutes, sectorCache };
