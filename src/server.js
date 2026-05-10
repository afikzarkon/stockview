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
const TWELVEDATA_API_URL = 'https://api.twelvedata.com/quote';

function parsePrice(token) {
  const s = String(token || '').replace(/,/g, '').trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parsePercent(token) {
  const s = String(token || '')
    .replace(/[\u2212\u2012\u2013\u2014]/g, '-')
    .replace(/[%\s]/g, '')
    .trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function getTwelveDataCandidateSymbols(stockId) {
  const raw = String(stockId || '').trim();
  const mapRaw = String(process.env.TWELVEDATA_SYMBOL_MAP || '').trim();
  let mappedSymbol = '';
  if (mapRaw) {
    try {
      const parsed = JSON.parse(mapRaw);
      mappedSymbol = String(parsed?.[raw] || '').trim();
    } catch (_) {
      // ignore invalid map format and continue with generic candidates.
    }
  }
  return [mappedSymbol, raw, `${raw}:TLV`, `${raw}.TLV`].filter(Boolean);
}

async function scrapeTwelveDataWithAxios(stockId) {
  const apiKey = String(process.env.TWELVEDATA_API_KEY || '').trim();
  if (!apiKey) throw new Error('twelvedata api key missing');

  const candidates = getTwelveDataCandidateSymbols(stockId);
  let lastError = null;

  for (const symbol of candidates) {
    try {
      const { data } = await axios.get(TWELVEDATA_API_URL, {
        params: { symbol, apikey: apiKey },
        timeout: 12000
      });
      if (!data || data.status === 'error') {
        throw new Error((data && data.message) || 'twelvedata error');
      }
      const currentPrice = parsePrice(data.close || data.price || data.previous_close || '');
      const changePercent = parsePercent(
        data.percent_change || data.change_percent || data.percentChange || ''
      );
      if (currentPrice == null && changePercent == null) {
        throw new Error('twelvedata parse miss');
      }
      return { currentPrice, changePercent, symbol };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    `twelvedata failed for all symbols: ${candidates.join(', ')}${
      lastError && lastError.message ? ` (${lastError.message})` : ''
    }`
  );
}

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
  const cached = taseCache.get(cacheKey);
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
    console.log(
      `[israeli-stock:${cacheKey}] cache_hit source=${payload.source.provider} upstream=${payload.source.upstreamProvider} symbol=${payload.source.symbol || '-'}`
    );
    return res.json(payload);
  }

  console.log(`[israeli-stock:${cacheKey}] fetch_start`);
  try {
    const result = await scrapeTwelveDataWithAxios(cacheKey);
    const payload = {
      currentPrice: result.currentPrice,
      changePercent: result.changePercent,
      source: {
        provider: 'twelvedata',
        symbol: result.symbol
      }
    };
    taseCache.set(cacheKey, { payload, expiresAt: Date.now() + TASE_CACHE_TTL_MS });
    console.log(
      `[israeli-stock:${cacheKey}] twelvedata_ok symbol=${result.symbol} price=${payload.currentPrice} change=${payload.changePercent}`
    );
    return res.json(payload);
  } catch (twErr) {
    console.error(
      `[israeli-stock:${cacheKey}] twelvedata_fail ${
        twErr && twErr.message ? twErr.message : twErr
      }`
    );
    return res.json({
      currentPrice: null,
      changePercent: null,
      source: {
        provider: 'twelvedata',
        status: 'failed'
      }
    });
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
