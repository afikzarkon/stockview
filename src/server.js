// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { initDataStore } = require('./server/dataStore');
const { mountAuthRoutes } = require('./server/authRoutes');
const { mountPortfolioRoutes } = require('./server/portfolioRoutes');
const { fetchIsraeliStockQuote } = require('./server/israeliQuoteService');
const { scrapeTaseMajorData, closeTaseBrowser } = require('./server/taseScraper');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Server-side in-memory cache for /api/israeli-stock/:id responses.
// Avoids hammering TASE on every UI refresh and (more importantly) keeps the
// expensive puppeteer-based scraper from running per-stock per-poll.
// Override with ISRAELI_STOCK_CACHE_TTL_MS in .env. Set to 0 to disable.
const TASE_CACHE_TTL_MS = Number(process.env.ISRAELI_STOCK_CACHE_TTL_MS ?? 45 * 1000);
const taseCache = new Map();

app.get('/api/israeli-stock/:id', async (req, res) => {
  const stockId = req.params.id;
  const cacheKey = String(stockId || '').trim();
  if (!cacheKey) {
    return res.json({
      currentPrice: null,
      changePercent: null,
      source: { provider: 'none', reason: 'missing_stock_id' }
    });
  }
  const cached = TASE_CACHE_TTL_MS > 0 ? taseCache.get(cacheKey) : null;
  if (cached && cached.expiresAt > Date.now()) {
    const cachedPayload = cached.payload || {};
    const payload = {
      currentPrice:
        typeof cachedPayload.currentPrice === 'number' ? cachedPayload.currentPrice : null,
      changePercent:
        typeof cachedPayload.changePercent === 'number' ? cachedPayload.changePercent : null,
      source: {
        provider: 'cache',
        upstreamProvider: cachedPayload?.source?.provider || 'unknown',
        symbol: cachedPayload?.source?.symbol || null
      }
    };
    return res.json(payload);
  }

  try {
    const result = await fetchIsraeliStockQuote(cacheKey);
    const payload = {
      currentPrice: result.currentPrice,
      changePercent: result.changePercent,
      source: {
        provider: result.sourceLabel || 'unknown',
        symbol: result.symbolUsed || null
      }
    };
    if (TASE_CACHE_TTL_MS > 0) {
      taseCache.set(cacheKey, { payload, expiresAt: Date.now() + TASE_CACHE_TTL_MS });
    }
    return res.json(payload);
  } catch (err) {
    console.error(
      `[israeli-stock:${cacheKey}] quote_fail ${err && err.message ? err.message : err}`
    );
    const detail = err && err.message ? String(err.message) : String(err);
    return res.json({
      currentPrice: null,
      changePercent: null,
      source: {
        provider: 'failed',
        status: 'failed',
        detail: detail.length > 400 ? `${detail.slice(0, 400)}…` : detail
      }
    });
  }
});

// נתיב דיבאג להחזרת דוגמת טקסט מהדף (לעזור בכיול רג'קס)
// Debug route removed by request

// --- TASE web-scraping endpoint -------------------------------------------------
// GET /api/tase/scrape/:query
//   :query may be a TASE security id ("1159250" / "01159250") OR a free-text name
//   ("טבע", "TEVA"). The handler launches a real headless browser, loads
//   https://market.tase.co.il/he/market_data/security/<id>/major_data, waits for the
//   Angular app to render, and extracts שער אחרון + שינוי from the rendered DOM.
//
// Response shape:
//   { ok, query, secId, securityName, lastRate, changePercent, source, url }
const TASE_SCRAPE_CACHE_TTL_MS = Number(process.env.TASE_SCRAPE_CACHE_TTL_MS || 60 * 1000);
const taseScrapeCache = new Map();

app.get('/api/tase/scrape/:query', async (req, res) => {
  const query = String(req.params.query || '').trim();
  if (!query) return res.status(400).json({ ok: false, error: 'missing query' });

  const cacheKey = query.toLowerCase();
  const cached = taseScrapeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return res.json({ ...cached.payload, cached: true });
  }

  console.log(`[tase-scrape:${query}] start`);
  try {
    const result = await scrapeTaseMajorData(query);
    const payload = {
      ok: true,
      query: result.query,
      secId: result.secId,
      securityName: result.securityName,
      lastRate: result.lastRate,
      changePercent: result.changePercent,
      source: result.source,
      url: result.url
    };
    taseScrapeCache.set(cacheKey, {
      payload,
      expiresAt: Date.now() + TASE_SCRAPE_CACHE_TTL_MS
    });
    console.log(
      `[tase-scrape:${query}] ok secId=${payload.secId} lastRate=${payload.lastRate} change=${payload.changePercent}`
    );
    return res.json(payload);
  } catch (err) {
    const msg = err && err.message ? String(err.message) : String(err);
    console.error(`[tase-scrape:${query}] fail ${msg}`);
    return res.status(502).json({ ok: false, error: msg });
  }
});

const PORT = Number(process.env.PORT) || 5000;

initDataStore()
  .then((store) => {
    mountAuthRoutes(app, store);
    mountPortfolioRoutes(app, store);
    console.log(`DB: ${store.kind === 'postgres' ? 'PostgreSQL (DATABASE_URL)' : 'SQLite local file'}`);
    app.listen(PORT, () => {
      console.log(`StockView API http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to init database:', err);
    process.exit(1);
  });

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    try {
      await closeTaseBrowser();
    } finally {
      process.exit(0);
    }
  });
}
