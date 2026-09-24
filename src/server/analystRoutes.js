// Analyst coverage for US stocks: consensus rating, price targets, and
// recent upgrade/downgrade history — via the same Yahoo quoteSummary
// endpoint already used for sector data (sectorRoutes.js), so it shares
// the same crumb/cookie auth (yahooCrumb.js) and the same batched-POST +
// per-symbol-cache shape. Public data, no user auth needed.
const { fetchYahooAnalystData } = require('./yahooQuotes');
const { createSymbolCache } = require('./symbolCache');

// 6h for resolved data: analyst consensus doesn't move minute to minute,
// so a few-hours-old target price is a far better answer than a null -
// see symbolCache.js.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_SYMBOLS_PER_REQUEST = 30;

const analystCache = createSymbolCache({
  name: 'analyst',
  ttlMs: CACHE_TTL_MS,
  fetchOne: fetchYahooAnalystData,
  fallback: () => ({
    recommendationKey: null,
    numberOfAnalystOpinions: null,
    targetMeanPrice: null,
    targetHighPrice: null,
    targetLowPrice: null,
    currentTrend: null,
    upgradeHistory: []
  })
});

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
      const results = await Promise.all(cleaned.map((symbol) => analystCache.get(symbol)));
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

module.exports = { mountAnalystRoutes, analystCache };
