// The "חקר מניות" stock research page: fundamentals for a single searched-up
// symbol (see fetchYahooStockResearch in yahooQuotes.js) and ticker/company
// autocomplete (fetchYahooSymbolSearch). Both public data, no user auth
// needed - same reasoning as sectorRoutes.js/benchmarkRoutes.js. Unlike
// every other *Routes.js file in this project, these endpoints take one
// symbol at a time (a "look up this stock" flow, not a portfolio-wide
// batch) — GET with a path/query param, not POST with a symbols array.
const { fetchYahooStockResearch, fetchYahooSymbolSearch } = require('./yahooQuotes');

const RESEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h, matches analystRoutes.js/dividendRoutes.js
const FAILURE_CACHE_TTL_MS = 5 * 60 * 1000; // 5min for a failed lookup - see sectorRoutes.js for why
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000; // 10min - autocomplete results barely change

const researchCache = new Map();
const researchInFlight = new Map();
const searchCache = new Map();
const searchInFlight = new Map();

async function getCachedResearch(symbol) {
  const cached = researchCache.get(symbol);
  if (cached) {
    const ttl = cached.isFailure ? FAILURE_CACHE_TTL_MS : RESEARCH_CACHE_TTL_MS;
    if (Date.now() - cached.ts < ttl) return cached.data;
  }

  const existingInFlight = researchInFlight.get(symbol);
  if (existingInFlight) return existingInFlight;

  const requestPromise = (async () => {
    try {
      const data = await fetchYahooStockResearch(symbol);
      researchCache.set(symbol, { data, ts: Date.now(), isFailure: false });
      return data;
    } catch (err) {
      console.warn('[stock-research] failed to resolve symbol', { symbol, error: err && err.message });
      researchCache.set(symbol, { data: null, ts: Date.now(), isFailure: true });
      return null;
    }
  })();

  researchInFlight.set(symbol, requestPromise);
  try {
    return await requestPromise;
  } finally {
    researchInFlight.delete(symbol);
  }
}

async function getCachedSearch(query) {
  const cached = searchCache.get(query);
  if (cached && Date.now() - cached.ts < SEARCH_CACHE_TTL_MS) return cached.data;

  const existingInFlight = searchInFlight.get(query);
  if (existingInFlight) return existingInFlight;

  const requestPromise = (async () => {
    try {
      const results = await fetchYahooSymbolSearch(query);
      searchCache.set(query, { data: results, ts: Date.now() });
      return results;
    } catch (err) {
      console.warn('[stock-search] failed to search', { query, error: err && err.message });
      return [];
    }
  })();

  searchInFlight.set(query, requestPromise);
  try {
    return await requestPromise;
  } finally {
    searchInFlight.delete(query);
  }
}

function mountStockResearchRoutes(app) {
  app.get('/api/stock-research/:symbol', async (req, res) => {
    const symbol = String(req.params.symbol || '').trim().toUpperCase();
    if (!symbol) {
      return res.status(400).json({ error: 'missing symbol' });
    }

    const data = await getCachedResearch(symbol);
    if (!data) {
      return res.status(502).json({ error: 'לא ניתן היה למשוך נתוני מנייה' });
    }
    return res.json({ symbol, research: data });
  });

  app.get('/api/stock-search', async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) {
      return res.json({ results: [] });
    }

    const results = await getCachedSearch(query);
    return res.json({ results });
  });
}

module.exports = { mountStockResearchRoutes };
