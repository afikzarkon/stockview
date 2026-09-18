// Stock/FX quote routes: Israeli stock prices (TASE scrape), American stock
// prices, and the USD/ILS exchange rate (both via Yahoo Finance).
// Extracted from server.js — behavior is unchanged, only the location moved.
const {
  readCachedTaseQuote,
  readStaleTaseQuote,
  writeCachedTaseQuote,
  isUsableTasePayload,
  scrapeTaseQuote
} = require('./taseScraper');
const { fetchTaseQuoteFromApi } = require('./taseQuoteApi');
const { fetchTaseQuoteFromEod } = require('./taseHistoryApi');
const { getYahooPayload, fetchYahooHistoricalRateForDate } = require('./yahooQuotes');
const { searchIsraeliSecuritiesByName } = require('./bizportalSearch');

const taseInFlight = new Map();

function errMessage(err) {
  if (!err) return 'unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  return String(err);
}

// Ordered fallback chain for an Israeli stock quote - each entry takes a
// security id and is tried in turn until one returns a usable payload.
// Adding another public source later means adding one more entry here, not
// touching fetchTaseQuote's control flow.
//
// Ordering is cheapest-and-most-reliable first. The two JSON APIs are
// independent of each other (different endpoints, different response
// shapes) and independent of the page scraper, so a quote is only lost if
// all three fail - unlike the previous chain, whose axios entry could never
// succeed at all (see taseScraper.js's header), leaving Puppeteer as a
// single point of failure and a null price whenever it timed out.
//
// `retryOnce` stays on the Puppeteer entry only: transient timeouts and RAM
// pressure on small hosting tiers are common there and usually resolve on a
// second attempt. A failing HTTP call to either API is not worth a blind
// retry - the chain itself is the retry, with a different source.
const TASE_SOURCES = [
  { name: 'tase-api', fn: fetchTaseQuoteFromApi, retryOnce: false },
  { name: 'tase-eod', fn: fetchTaseQuoteFromEod, retryOnce: false },
  { name: 'puppeteer', fn: scrapeTaseQuote, retryOnce: true }
];

async function attemptTaseSource(source, stockId) {
  const result = await source.fn(stockId);
  const payload = { currentPrice: result.currentPrice, changePercent: result.changePercent };
  if (!isUsableTasePayload(payload)) {
    const err = new Error(`${source.name} returned unusable payload`);
    err._debugTextSnippet = result._debugTextSnippet;
    throw err;
  }
  return { payload, result };
}

async function runTaseSource(source, stockId) {
  try {
    return await attemptTaseSource(source, stockId);
  } catch (firstErr) {
    if (!source.retryOnce) throw firstErr;
    // כשל חד-פעמי/זמני (timeout גבולי, עומס רגעי) הוא נפוץ בסביבות עם
    // מעט RAM כמו ה-tier החינמי של Render - ניסיון חוזר אחד מספיק
    // כדי לתפוס הרבה מהמקרים האלה בלי לפגוע משמעותית בזמן התגובה.
    console.warn(`[tase] first ${source.name} attempt failed, retrying once`, {
      stockId,
      error: errMessage(firstErr)
    });
    return await attemptTaseSource(source, stockId);
  }
}

async function fetchTaseQuote(stockId, req) {
  const errors = {};
  for (const source of TASE_SOURCES) {
    try {
      const { payload, result } = await runTaseSource(source, stockId);
      // Logged on every success too (not just failures) - a quote can look
      // "usable" (both fields are finite numbers) while still being wrong,
      // e.g. if the scraper's regex matched a different field on the page
      // than intended. Every source fills in _debugPriceMatch, so this line
      // names which source won and what produced the price, and a scaling
      // bug can be diagnosed directly instead of guessed at.
      console.log(`[tase] ${source.name} succeeded`, {
        stockId,
        payload,
        priceMatch: result._debugPriceMatch
      });
      writeCachedTaseQuote(stockId, payload);
      return payload;
    } catch (err) {
      errors[source.name] = errMessage(err);
      console.warn(`[tase] ${source.name} failed`, {
        stockId,
        error: errMessage(err),
        // מה שהמקור בפועל "ראה" - עוזר לדעת אם הבעיה היא עמוד חסימת בוט,
        // מבנה טקסט שונה מהצפוי, או שהעמוד בכלל לא נטען.
        pageTextSnippet: err._debugTextSnippet
      });
    }
  }

  console.error('[tase] all sources failed', { stockId, errors });
  const stale = readStaleTaseQuote(stockId);
  if (stale) {
    console.warn('[tase] serving stale cached quote after failures', { stockId });
    return stale;
  }
  if (req.query && (req.query.debug === '1' || req.query.debug === 'true')) {
    return {
      currentPrice: null,
      changePercent: null,
      _debug: { stockId, sources: TASE_SOURCES.map((s) => s.name), errors }
    };
  }
  return { currentPrice: null, changePercent: null };
}

function mountQuotesRoutes(app) {
  app.get('/api/israeli-stock/:id', async (req, res) => {
    const stockId = req.params.id;
    if (!/^\d+$/.test(stockId)) {
      console.warn('[tase] invalid stock id', { stockId });
      return res.status(400).json({ error: 'invalid stock id' });
    }

    const cached = readCachedTaseQuote(stockId);
    if (cached) {
      return res.json(cached);
    }

    const existingInFlight = taseInFlight.get(stockId);
    if (existingInFlight) {
      try {
        const sharedResult = await existingInFlight;
        return res.json(sharedResult);
      } catch (err) {
        console.error('[tase] shared in-flight request failed', {
          stockId,
          error: errMessage(err)
        });
        const stale = readStaleTaseQuote(stockId);
        if (stale) return res.json(stale);
        return res.json({ currentPrice: null, changePercent: null });
      }
    }

    const quotePromise = fetchTaseQuote(stockId, req);
    taseInFlight.set(stockId, quotePromise);
    try {
      const payload = await quotePromise;
      return res.json(payload);
    } finally {
      taseInFlight.delete(stockId);
    }
  });

  app.get('/api/american-stock/:symbol', async (req, res) => {
    const symbol = (req.params.symbol || '').trim();
    if (!symbol) {
      return res.status(400).json({ error: 'invalid symbol' });
    }
    try {
      const payload = await getYahooPayload(symbol);
      return res.json(payload);
    } catch (err) {
      return res.json({ currentPrice: null, changePercent: 0 });
    }
  });

  app.get('/api/exchange-rate', async (req, res) => {
    try {
      const payload = await getYahooPayload('USDILS=X');
      return res.json({ rate: payload.currentPrice });
    } catch (err) {
      return res.json({ rate: null });
    }
  });

  // The USD/ILS rate on a specific past date (the day a US stock was
  // bought) - lets the "add stock" form auto-fill the exchange-rate field
  // instead of requiring the user to look it up and type it in.
  app.get('/api/exchange-rate/:date', async (req, res) => {
    const date = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'פורמט תאריך לא תקין' });
    }
    try {
      const result = await fetchYahooHistoricalRateForDate('USDILS=X', date);
      return res.json({ rate: result ? result.rate : null, date: result ? result.date : null });
    } catch (err) {
      return res.json({ rate: null, date: null });
    }
  });

  // Israeli/TASE security search by free-text company name (see
  // bizportalSearch.js) - lets the "add stock" form offer autocomplete
  // suggestions and auto-resolve the official company name instead of
  // requiring the user to already know the numeric TASE security id.
  app.get('/api/israeli-stock-search', async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) {
      return res.json({ results: [] });
    }
    try {
      const results = await searchIsraeliSecuritiesByName(query);
      return res.json({ results });
    } catch (err) {
      console.warn('[israeli-stock-search] failed', { query, error: errMessage(err) });
      return res.json({ results: [] });
    }
  });
}

module.exports = { mountQuotesRoutes };
