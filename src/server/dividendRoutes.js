// Dividend data for US stocks: forward-looking yield/payout/next date
// (quoteSummary, same crumb+cookie auth as sectorRoutes.js/analystRoutes.js)
// combined with actual historical payments (public chart endpoint, same as
// benchmarkRoutes.js). The two need different underlying data - a forward
// estimate vs. an actual payment ledger - so they're fetched and cached
// independently, and only combined here at the route layer.
//
// Also carries next-earnings-date fields (earningsDateEpoch,
// epsEstimateAverage, ...) - see fetchYahooDividendSummary in
// yahooQuotes.js for why: Yahoo's calendarEvents module returns dividend
// and earnings dates together in one response, so splitting them into two
// routes would mean two quoteSummary calls (two slots on the shared
// rate-limited queue) for data already fetched once here.
const { fetchYahooDividendSummary, fetchYahooDividendHistory } = require('./yahooQuotes');

const SUMMARY_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h, matches analystRoutes.js
const HISTORY_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h: past dividend payments never change
const FAILURE_CACHE_TTL_MS = 5 * 60 * 1000; // 5min for a failed lookup - see sectorRoutes.js for why
const MAX_SYMBOLS_PER_REQUEST = 30;

const summaryCache = new Map();
const summaryInFlight = new Map();
const historyCache = new Map();
const historyInFlight = new Map();

function isValidDateString(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function getCachedDividendSummary(symbol) {
  const cached = summaryCache.get(symbol);
  if (cached) {
    const ttl = cached.isFailure ? FAILURE_CACHE_TTL_MS : SUMMARY_CACHE_TTL_MS;
    if (Date.now() - cached.ts < ttl) return cached.data;
  }

  const existingInFlight = summaryInFlight.get(symbol);
  if (existingInFlight) return existingInFlight;

  const requestPromise = (async () => {
    try {
      const data = await fetchYahooDividendSummary(symbol);
      summaryCache.set(symbol, { data, ts: Date.now(), isFailure: false });
      return data;
    } catch (err) {
      console.warn('[dividends] failed to resolve summary', { symbol, error: err && err.message });
      const fallback = {
        dividendRate: null,
        dividendYieldPercent: null,
        payoutRatio: null,
        exDividendDateEpoch: null,
        nextDividendDateEpoch: null,
        earningsDateEpoch: null,
        isEarningsDateEstimate: null,
        epsEstimateAverage: null,
        revenueEstimateAverage: null
      };
      summaryCache.set(symbol, { data: fallback, ts: Date.now(), isFailure: true });
      return fallback;
    }
  })();

  summaryInFlight.set(symbol, requestPromise);
  try {
    return await requestPromise;
  } finally {
    summaryInFlight.delete(symbol);
  }
}

async function getCachedDividendHistory(symbol, fromDateStr) {
  const cacheKey = `${symbol}:${fromDateStr || 'default'}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < HISTORY_CACHE_TTL_MS) return cached.data;

  const existingInFlight = historyInFlight.get(cacheKey);
  if (existingInFlight) return existingInFlight;

  const requestPromise = (async () => {
    try {
      const history = await fetchYahooDividendHistory(symbol, fromDateStr);
      historyCache.set(cacheKey, { data: history, ts: Date.now() });
      return history;
    } catch (err) {
      console.warn('[dividends] failed to resolve history', { symbol, error: err && err.message });
      // Same "fail this one symbol, not the whole batch" approach as
      // correlationRoutes.js.
      return [];
    }
  })();

  historyInFlight.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    historyInFlight.delete(cacheKey);
  }
}

function mountDividendRoutes(app) {
  // POST (not GET) because the symbol list can be longer than is
  // comfortable in a query string — same reasoning as /api/stock-sectors.
  app.post('/api/dividend-data', async (req, res) => {
    const body = req.body || {};
    const symbols = Array.isArray(body.symbols) ? body.symbols : [];
    const cleaned = [...new Set(symbols.map((s) => String(s || '').trim().toUpperCase()).filter(Boolean))].slice(
      0,
      MAX_SYMBOLS_PER_REQUEST
    );
    const from = isValidDateString(body.from) ? body.from : undefined;

    if (cleaned.length === 0) {
      return res.json({ dividends: {} });
    }

    const results = await Promise.all(
      cleaned.map(async (symbol) => {
        const [summary, history] = await Promise.all([
          getCachedDividendSummary(symbol),
          getCachedDividendHistory(symbol, from)
        ]);
        return { ...summary, history };
      })
    );

    const dividends = {};
    cleaned.forEach((symbol, i) => {
      dividends[symbol] = results[i];
    });
    return res.json({ dividends });
  });
}

module.exports = { mountDividendRoutes };
