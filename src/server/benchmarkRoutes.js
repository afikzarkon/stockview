// Historical benchmark data (S&P 500 / TA-125), used by the frontend to
// draw "my portfolio vs. the market" alongside the equity curve from
// snapshotRoutes.js. This is public market data, not user-specific, so
// (like quotesRoutes.js) it doesn't require auth and is cached aggressively
// — a historical close from yesterday doesn't change.
const { fetchYahooHistoricalCloses } = require('./yahooQuotes');

// Only these two, deliberately whitelisted rather than accepting an
// arbitrary symbol from the query string — this endpoint has no auth, so an
// open "fetch any Yahoo symbol" proxy would be an easy abuse vector.
const BENCHMARKS = {
  sp500: { symbol: '^GSPC', label: 'S&P 500' },
  ta125: { symbol: '^TA125.TA', label: 'TA-125' }
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h: historical closes barely change intraday
const cache = new Map();
const inFlight = new Map();

function isValidDateString(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function getCachedBenchmarkHistory(symbol, fromDateStr) {
  const cacheKey = `${symbol}:${fromDateStr || 'default'}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data;

  const existingInFlight = inFlight.get(cacheKey);
  if (existingInFlight) return existingInFlight;

  const requestPromise = (async () => {
    const points = await fetchYahooHistoricalCloses(symbol, fromDateStr);
    cache.set(cacheKey, { data: points, ts: Date.now() });
    return points;
  })();

  inFlight.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    inFlight.delete(cacheKey);
  }
}

function mountBenchmarkRoutes(app) {
  app.get('/api/benchmark-history/:key', async (req, res) => {
    const benchmark = BENCHMARKS[req.params.key];
    if (!benchmark) {
      return res.status(400).json({ error: 'מדד לא נתמך' });
    }
    const from = isValidDateString(req.query.from) ? req.query.from : undefined;
    try {
      const points = await getCachedBenchmarkHistory(benchmark.symbol, from);
      return res.json({ key: req.params.key, label: benchmark.label, symbol: benchmark.symbol, points });
    } catch (err) {
      console.error('[benchmark] failed to fetch history', {
        key: req.params.key,
        symbol: benchmark.symbol,
        error: err && err.message
      });
      return res.status(502).json({ error: 'לא ניתן היה למשוך נתוני מדד ייחוס' });
    }
  });
}

module.exports = { mountBenchmarkRoutes, BENCHMARKS };
