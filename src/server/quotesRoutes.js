// Stock/FX quote routes: Israeli stock prices (TASE scrape), American stock
// prices, and the USD/ILS exchange rate (both via Yahoo Finance).
// Extracted from server.js — behavior is unchanged, only the location moved.
const {
  readCachedTaseQuote,
  readStaleTaseQuote,
  writeCachedTaseQuote,
  isUsableTasePayload,
  scrapeTaseWithPuppeteer,
  scrapeTaseFallbackWithAxios
} = require('./taseScraper');
const { getYahooPayload, fetchYahooHistoricalRateForDate } = require('./yahooQuotes');
const { searchIsraeliSecuritiesByName } = require('./bizportalSearch');

const taseInFlight = new Map();

function errMessage(err) {
  if (!err) return 'unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  return String(err);
}

// Ordered fallback chain for an Israeli stock quote - each entry is tried
// in turn until one returns a usable payload. Adding another public source
// (e.g. Globes/Bizportal) later means adding one more entry here, not
// touching fetchTaseQuote's control flow. `retryOnce` mirrors the original
// behavior: a single retry for the flaky Puppeteer path (transient
// timeouts/RAM pressure on small hosting tiers are common and usually
// resolve on a second attempt), no retry for the cheaper axios fallback.
const TASE_SOURCES = [
  { name: 'puppeteer', fn: scrapeTaseWithPuppeteer, retryOnce: true },
  { name: 'axios-fallback', fn: scrapeTaseFallbackWithAxios, retryOnce: false }
];

async function attemptTaseSource(source, taseUrl, stockId) {
  const result = await source.fn(taseUrl);
  const payload = { currentPrice: result.currentPrice, changePercent: result.changePercent };
  if (!isUsableTasePayload(payload)) {
    const err = new Error(`${source.name} returned unusable payload`);
    err._debugTextSnippet = result._debugTextSnippet;
    throw err;
  }
  return { payload, result };
}

async function runTaseSource(source, taseUrl, stockId) {
  try {
    return await attemptTaseSource(source, taseUrl, stockId);
  } catch (firstErr) {
    if (!source.retryOnce) throw firstErr;
    // כשל חד-פעמי/זמני (timeout גבולי, עומס רגעי) הוא נפוץ בסביבות עם
    // מעט RAM כמו ה-tier החינמי של Render - ניסיון חוזר אחד מספיק
    // כדי לתפוס הרבה מהמקרים האלה בלי לפגוע משמעותית בזמן התגובה.
    console.warn(`[tase] first ${source.name} attempt failed, retrying once`, {
      stockId,
      error: errMessage(firstErr)
    });
    return await attemptTaseSource(source, taseUrl, stockId);
  }
}

async function fetchTaseQuote(stockId, req) {
  const taseUrl = `https://market.tase.co.il/he/market_data/security/${stockId}/major_data`;
  const errors = {};
  for (const source of TASE_SOURCES) {
    try {
      const { payload, result } = await runTaseSource(source, taseUrl, stockId);
      // Logged on every success too (not just failures) - a scrape can look
      // "usable" (both fields are finite numbers) while still being wrong,
      // e.g. if the regex matched a different field on the page than
      // intended. This shows exactly what label/text produced the price,
      // so a scaling bug can be diagnosed directly instead of guessed at.
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
    return { currentPrice: null, changePercent: null, _debug: { stockId, taseUrl, errors } };
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
