// Yahoo Finance quote fetching (used for both US stock prices and the
// USD/ILS exchange rate). Extracted from server.js — behavior is
// unchanged, only the location moved.
const axios = require('axios');

const YAHOO_CACHE_TTL_MS = 15 * 1000;
const yahooChartCache = new Map();
const yahooInFlight = new Map();

const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json'
};

function readCachedYahoo(symbol) {
  const cached = yahooChartCache.get(symbol);
  if (!cached) return null;
  if (Date.now() - cached.ts > YAHOO_CACHE_TTL_MS) return null;
  return cached.data;
}

function writeCachedYahoo(symbol, data) {
  yahooChartCache.set(symbol, { data, ts: Date.now() });
}

async function fetchYahooChartMeta(symbol) {
  const encoded = encodeURIComponent(symbol);
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}`;
  const response = await axios.get(yahooUrl, {
    timeout: 12000,
    headers: YAHOO_HEADERS
  });

  const result = response?.data?.chart?.result;
  if (!Array.isArray(result) || result.length === 0 || !result[0]?.meta) {
    throw new Error('missing yahoo chart data');
  }

  return result[0].meta;
}

async function getYahooPayload(symbol) {
  const cached = readCachedYahoo(symbol);
  if (cached) return cached;

  const inFlight = yahooInFlight.get(symbol);
  if (inFlight) return inFlight;

  const requestPromise = (async () => {
    const meta = await fetchYahooChartMeta(symbol);
    const currentPrice = Number(meta.regularMarketPrice);
    const rawChange =
      meta.regularMarketChangePercent ??
      meta.changePercent ??
      meta.regularMarketChange ??
      meta.change ??
      0;

    let finalChangePercent = 0;
    if (rawChange && rawChange !== 0) {
      finalChangePercent = Number(rawChange) * 100;
    } else if (meta.previousClose && meta.regularMarketPrice) {
      const change = Number(meta.regularMarketPrice) - Number(meta.previousClose);
      finalChangePercent = (change / Number(meta.previousClose)) * 100;
    }

    const payload = {
      currentPrice: Number.isFinite(currentPrice) ? currentPrice : null,
      changePercent: Number.isFinite(finalChangePercent) ? finalChangePercent : 0
    };
    writeCachedYahoo(symbol, payload);
    return payload;
  })();

  yahooInFlight.set(symbol, requestPromise);
  try {
    return await requestPromise;
  } finally {
    yahooInFlight.delete(symbol);
  }
}

// Daily closing prices for a symbol between fromDateStr (YYYY-MM-DD, or ~13
// months back if omitted) and today. Used for benchmark comparison
// (^GSPC / ^TA125.TA) — a different endpoint shape than getYahooPayload
// above (full timestamp+close arrays instead of just the latest meta), so
// it's a separate function rather than reusing fetchYahooChartMeta.
async function fetchYahooHistoricalCloses(symbol, fromDateStr) {
  const encoded = encodeURIComponent(symbol);
  const period1 = fromDateStr
    ? Math.floor(new Date(`${fromDateStr}T00:00:00Z`).getTime() / 1000)
    : Math.floor(Date.now() / 1000) - 400 * 24 * 60 * 60;
  const period2 = Math.floor(Date.now() / 1000);

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}`;
  const response = await axios.get(yahooUrl, {
    params: { period1, period2, interval: '1d' },
    timeout: 15000,
    headers: YAHOO_HEADERS
  });

  const result = response?.data?.chart?.result;
  if (!Array.isArray(result) || result.length === 0) {
    throw new Error('missing yahoo chart data');
  }

  const { timestamp, indicators } = result[0];
  const closes = indicators?.quote?.[0]?.close;
  if (!Array.isArray(timestamp) || !Array.isArray(closes)) {
    throw new Error('missing yahoo timestamp/close series');
  }

  const points = [];
  for (let i = 0; i < timestamp.length; i++) {
    const close = closes[i];
    if (close === null || close === undefined || !Number.isFinite(Number(close))) continue;
    // Yahoo timestamps are UTC seconds; the UTC calendar date is close
    // enough for daily bars (a trading session doesn't cross midnight UTC
    // in any timezone we care about here).
    const date = new Date(timestamp[i] * 1000).toISOString().slice(0, 10);
    points.push({ date, close: Number(close) });
  }
  return points;
}

module.exports = { getYahooPayload, fetchYahooHistoricalCloses };
