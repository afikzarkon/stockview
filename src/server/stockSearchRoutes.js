// Ticker/company autocomplete (fetchYahooSymbolSearch). Public data, no
// user auth needed - same reasoning as sectorRoutes.js/benchmarkRoutes.js.
// Unlike most *Routes.js files here this takes one query at a time (a
// "look up this stock" flow, not a portfolio-wide batch) — GET with a
// query param, not POST with a symbols array.
//
// This file used to also serve /api/stock-research/:symbol for the "חקר
// מניות" page. That page has been removed; the autocomplete stayed,
// because the add/edit form uses it to resolve a US ticker while a holding
// is being entered (see hooks/useStockSearch.js).
const { fetchYahooSymbolSearch } = require('./yahooQuotes');

const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000; // 10min - autocomplete results barely change

const searchCache = new Map();
const searchInFlight = new Map();

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

function mountStockSearchRoutes(app) {
  app.get('/api/stock-search', async (req, res) => {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) {
      return res.json({ results: [] });
    }

    const results = await getCachedSearch(query);
    return res.json({ results });
  });
}

module.exports = { mountStockSearchRoutes };
