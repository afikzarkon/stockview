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
const { isTaseApiConfigured, fetchTaseQuoteFromApi } = require('./taseApi');
const { getYahooPayload } = require('./yahooQuotes');

const taseInFlight = new Map();

function errMessage(err) {
  if (!err) return 'unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  return String(err);
}

async function fetchTaseQuote(stockId, req) {
  // Official TASE Data Hub API - tried first when configured. This will
  // simply fail (and fall through to scraping below) until TASE approves
  // the "Securities Prices - Online" product registration in the
  // developer portal (it starts in a "PENDING" state) - no code change
  // needed once it's approved, it just starts working.
  if (isTaseApiConfigured()) {
    try {
      const payload = await fetchTaseQuoteFromApi(stockId);
      writeCachedTaseQuote(stockId, payload);
      return payload;
    } catch (err) {
      console.warn('[tase] official API failed, falling back to scraping', {
        stockId,
        error: errMessage(err)
      });
    }
  }

  const taseUrl = `https://market.tase.co.il/he/market_data/security/${stockId}/major_data`;
  try {
    let result;
    try {
      result = await scrapeTaseWithPuppeteer(taseUrl);
      if (!isUsableTasePayload({ currentPrice: result.currentPrice, changePercent: result.changePercent })) {
        throw new Error('first attempt returned unusable payload');
      }
    } catch (firstAttemptErr) {
      // כשל חד-פעמי/זמני (timeout גבולי, עומס רגעי) הוא נפוץ בסביבות עם
      // מעט RAM כמו ה-tier החינמי של Render - ניסיון חוזר אחד מספיק
      // כדי לתפוס הרבה מהמקרים האלה בלי לפגוע משמעותית בזמן התגובה.
      console.warn('[tase] first puppeteer attempt failed, retrying once', {
        stockId,
        error: errMessage(firstAttemptErr)
      });
      result = await scrapeTaseWithPuppeteer(taseUrl);
    }
    const payload = { currentPrice: result.currentPrice, changePercent: result.changePercent };
    if (!isUsableTasePayload(payload)) {
      console.warn('[tase] puppeteer returned unusable payload (after retry)', {
        stockId,
        payload,
        // מה שהדפדפן בפועל "רואה" בדף - עוזר לדעת אם הבעיה היא עמוד חסימת בוט,
        // מבנה טקסט שונה מהצפוי, או שהעמוד בכלל לא נטען.
        pageTextSnippet: result._debugTextSnippet
      });
      throw new Error('puppeteer returned unusable payload');
    }
    writeCachedTaseQuote(stockId, payload);
    return payload;
  } catch (err) {
    console.warn('[tase] puppeteer scrape failed, trying fallback', {
      stockId,
      error: errMessage(err)
    });
    try {
      const result = await scrapeTaseFallbackWithAxios(taseUrl);
      const payload = { currentPrice: result.currentPrice, changePercent: result.changePercent };
      if (!isUsableTasePayload(payload)) {
        console.warn('[tase] axios fallback returned unusable payload', {
          stockId,
          payload,
          pageTextSnippet: result._debugTextSnippet
        });
        throw new Error('axios fallback returned unusable payload');
      }
      writeCachedTaseQuote(stockId, payload);
      return payload;
    } catch (e2) {
      console.error('[tase] both scraping methods failed', {
        stockId,
        puppeteerError: errMessage(err),
        fallbackError: errMessage(e2)
      });
      const stale = readStaleTaseQuote(stockId);
      if (stale) {
        console.warn('[tase] serving stale cached quote after failures', { stockId });
        return stale;
      }
      if (req.query && (req.query.debug === '1' || req.query.debug === 'true')) {
        return {
          currentPrice: null,
          changePercent: null,
          _debug: {
            stockId,
            taseUrl,
            puppeteerError: errMessage(err),
            fallbackError: errMessage(e2)
          }
        };
      }
      return { currentPrice: null, changePercent: null };
    }
  }
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
}

module.exports = { mountQuotesRoutes };
