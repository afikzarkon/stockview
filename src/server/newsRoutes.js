// Recent news headlines for US stocks, via Yahoo's public search endpoint
// (see fetchYahooNews in yahooQuotes.js — no crumb/cookie needed, unlike
// sectorRoutes.js/analystRoutes.js). Public data, no user auth needed,
// same reasoning as those. Cached for a much shorter time than
// sector/analyst data (news is time-sensitive, not "barely changes
// day-to-day" like a company's sector classification) — see CACHE_TTL_MS.
const { fetchYahooNews } = require('./yahooQuotes');

const CACHE_TTL_MS = 30 * 60 * 1000; // 30min - fresh enough for a "recent news" feed
const FAILURE_CACHE_TTL_MS = 5 * 60 * 1000; // 5min for a failed lookup - see sectorRoutes.js for why
const cache = new Map();
const inFlight = new Map();
const MAX_SYMBOLS_PER_REQUEST = 30;
const NEWS_PER_SYMBOL = 10;

async function getCachedNews(symbol) {
  const cached = cache.get(symbol);
  if (cached) {
    const ttl = cached.isFailure ? FAILURE_CACHE_TTL_MS : CACHE_TTL_MS;
    if (Date.now() - cached.ts < ttl) return cached.data;
  }

  const existingInFlight = inFlight.get(symbol);
  if (existingInFlight) return existingInFlight;

  const requestPromise = (async () => {
    try {
      const data = await fetchYahooNews(symbol, NEWS_PER_SYMBOL);
      cache.set(symbol, { data, ts: Date.now(), isFailure: false });
      return data;
    } catch (err) {
      console.warn('[news] failed to resolve symbol', { symbol, error: err && err.message });
      cache.set(symbol, { data: [], ts: Date.now(), isFailure: true });
      return [];
    }
  })();

  inFlight.set(symbol, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlight.delete(symbol);
  }
}

function mountNewsRoutes(app) {
  // POST (not GET) because the symbol list can be longer than is
  // comfortable in a query string — same reasoning as /api/stock-sectors.
  app.post('/api/stock-news', async (req, res) => {
    const body = req.body || {};
    const symbols = Array.isArray(body.symbols) ? body.symbols : [];
    const cleaned = [...new Set(symbols.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))].slice(
      0,
      MAX_SYMBOLS_PER_REQUEST
    );

    if (cleaned.length === 0) {
      return res.json({ news: {} });
    }

    const results = await Promise.all(cleaned.map((symbol) => getCachedNews(symbol)));
    const news = {};
    cleaned.forEach((symbol, i) => {
      news[symbol] = results[i];
    });
    return res.json({ news });
  });
}

module.exports = { mountNewsRoutes };
