// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { initDataStore } = require('./server/dataStore');
const { mountAuthRoutes } = require('./server/authRoutes');
const { mountPortfolioRoutes } = require('./server/portfolioRoutes');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

const TASE_CACHE_TTL_MS = 45 * 1000;
const taseCache = new Map();

async function scrapeFunderWithAxios(stockId) {
  const url = `https://www.funder.co.il/etf/${encodeURIComponent(String(stockId || '').trim())}`;
  const { data } = await axios.get(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7'
    },
    timeout: 12000
  });
  const html = typeof data === 'string' ? data : '';
  const compact = html.replace(/\s+/g, ' ');
  const sectionMatch = compact.match(
    /שער אחרון<\/div>\s*<div[^>]*>שינוי<\/div>\s*<div[^>]*>מחזור מסחר<\/div>\s*<div[^>]*>([^<]+)<\/div>\s*<div[^>]*>(?:<span[^>]*>)?([^<]+)(?:<\/span>)?<\/div>/i
  );
  if (!sectionMatch) {
    throw new Error('funder parse miss');
  }
  const parsePrice = (token) => {
    const s = String(token || '').replace(/,/g, '').trim();
    const n = parseFloat(s);
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const parsePercent = (token) => {
    const s = String(token || '')
      .replace(/[\u2212\u2012\u2013\u2014]/g, '-')
      .replace(/[%\s]/g, '')
      .trim();
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  };
  const currentPrice = parsePrice(sectionMatch[1]);
  const changePercent = parsePercent(sectionMatch[2]);
  return { currentPrice, changePercent };
}

app.get('/api/israeli-stock/:id', async (req, res) => {
  const stockId = req.params.id;
  const cacheKey = String(stockId || '').trim();
  if (!cacheKey) return res.json({ currentPrice: null, changePercent: null });
  const cached = taseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`[israeli-stock:${cacheKey}] cache_hit`);
    return res.json(cached.payload);
  }

  console.log(`[israeli-stock:${cacheKey}] fetch_start`);
  try {
    const result = await scrapeFunderWithAxios(cacheKey);
    const payload = { currentPrice: result.currentPrice, changePercent: result.changePercent };
    taseCache.set(cacheKey, { payload, expiresAt: Date.now() + TASE_CACHE_TTL_MS });
    console.log(
      `[israeli-stock:${cacheKey}] funder_ok price=${payload.currentPrice} change=${payload.changePercent}`
    );
    return res.json(payload);
  } catch (err) {
    console.error(
      `[israeli-stock:${cacheKey}] funder_fail ${err && err.message ? err.message : err}`
    );
    return res.json({ currentPrice: null, changePercent: null });
  }
});

// נתיב דיבאג להחזרת דוגמת טקסט מהדף (לעזור בכיול רג'קס)
// Debug route removed by request

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
