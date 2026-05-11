// server.js
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { initDataStore } = require('./server/dataStore');
const { mountAuthRoutes } = require('./server/authRoutes');
const { mountPortfolioRoutes } = require('./server/portfolioRoutes');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

const TASE_CACHE_TTL_MS = 60 * 1000;
const taseQuoteCache = new Map();
const taseInFlight = new Map();
let browserPromise = null;
const YAHOO_CACHE_TTL_MS = 15 * 1000;
const yahooChartCache = new Map();
const yahooInFlight = new Map();

function errMessage(err) {
  if (!err) return 'unknown error';
  if (typeof err === 'string') return err;
  if (err.message) return err.message;
  return String(err);
}

function readCachedTaseQuote(stockId) {
  const cached = taseQuoteCache.get(stockId);
  if (!cached) return null;
  if (Date.now() - cached.ts > TASE_CACHE_TTL_MS) return null;
  return cached.data;
}

function readStaleTaseQuote(stockId) {
  const cached = taseQuoteCache.get(stockId);
  return cached ? cached.data : null;
}

function writeCachedTaseQuote(stockId, data) {
  taseQuoteCache.set(stockId, { data, ts: Date.now() });
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  try {
    return await browserPromise;
  } catch (err) {
    browserPromise = null;
    throw err;
  }
}

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
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    }
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

async function scrapeTaseWithPuppeteer(taseUrl) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.goto(taseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    try {
      await page.waitForFunction(() => /שווי\s*יחידה|%/.test((document.body.innerText || '').replace(/\s+/g, ' ')), { timeout: 7000 });
    } catch (_) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    return await page.evaluate(() => {
      // Normalize Unicode minus (U+2212) to ASCII '-', remove bidi/control chars
      const normalizeText = (t) => (t || '')
        .replace(/[\u2212\u2012\u2013\u2014]/g, '-')
        .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
        .replace(/\s+/g, ' ');

      const parsePercentToken = (token) => {
        if (!token) return null;
        const s = token.replace(/[\u2212\u2012\u2013\u2014]/g, '-');
        // Detect minus anywhere (prefix or suffix or inside parentheses)
        const isNegative = /-/.test(s) || /\(\s*\d/.test(s) && /\)/.test(s) && /-/.test(s);
        // Extract numeric part
        const numMatch = s.match(/\d+(?:\.\d+)?/);
        if (!numMatch) return null;
        const val = parseFloat(numMatch[0]);
        return isNegative ? -val : val;
      };
      const parsePriceToken = (token) => {
        if (!token) return null;
        // remove bidi/control chars and whitespace, drop thousands separators
        const cleaned = token
          .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
          .replace(/\s+/g, '')
          .replace(/,/g, '');
        const num = parseFloat(cleaned);
        if (!Number.isFinite(num)) return null;
        // return price in agorot (multiply by 100)
        return Math.round(num * 100);
      };

      const text = normalizeText(document.body.innerText || '');
      const priceNumberRx = '(\\d[\\d\\s,.]*)';
      const priceRx = new RegExp(`שווי\\s*יחידה[^\\d]{0,80}${priceNumberRx}`);
      const lastPriceRx = new RegExp(`שער\\s*אחרון[^\\d]{0,80}${priceNumberRx}`);
      const openRx = new RegExp(`שער\\s*פתיחה[^\\d]{0,80}${priceNumberRx}`);
      // Capture flexible percent token (handles trailing minus and parentheses)
      const percentToken = '([()\\-\\u2212\\d.\u2012\u2013\u2014\u200E\u200F]+?)';
      const changeDailyRx = new RegExp(`שינוי\\s*יומי[^%]{0,30}${percentToken}%`);
      const anyPercentRx = new RegExp(`${percentToken}%`);

      let priceMatch = text.match(lastPriceRx) || text.match(priceRx) || text.match(openRx);
      let percentMatch = text.match(changeDailyRx) || text.match(anyPercentRx);

      const priceAgorot = priceMatch ? parsePriceToken(priceMatch[1]) : null;
      const currentPrice = priceAgorot !== null ? priceAgorot : null; // return in agorot
      const rawToken = percentMatch ? percentMatch[1] : null;
      let changePercent = percentMatch ? parsePercentToken(rawToken) : null;

      // Heuristic: if no explicit minus parsed but DOM styling suggests negative, flip sign
      if (changePercent !== null && changePercent > 0 && rawToken && !/-/.test(rawToken)) {
        try {
          const needle = (rawToken + '%').replace(/\s+/g, '');
          const candidates = Array.from(document.querySelectorAll('*'))
            .filter(el => el.childElementCount === 0 && /%/.test(el.textContent || ''))
            .map(el => ({ el, txt: (el.textContent || '').replace(/\s+/g, '') }))
            .filter(item => item.txt.includes(needle));
          const looksNegative = (el) => {
            const cs = window.getComputedStyle(el);
            const color = (cs && cs.color || '').toLowerCase();
            const cls = (el.className || '').toString().toLowerCase();
            const title = (el.getAttribute('title') || '').toLowerCase();
            const aria = (el.getAttribute('aria-label') || '').toLowerCase();
            const txt = (el.textContent || '').toLowerCase();
            const negWord = /(ירידה|שלילי|minus|neg|down|ירד|אדום)/.test(cls + ' ' + title + ' ' + aria + ' ' + txt);
            const redish = /rgb\(\s*(1?5\d|2[0-5]\d)\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)/.test(color) || /#(d[0-9a-f]{5}|c[0-9a-f]{5})/.test(color);
            return negWord || redish;
          };
          const negByStyle = candidates.some(c => looksNegative(c.el) || (c.el.parentElement && looksNegative(c.el.parentElement)));
          if (negByStyle) {
            changePercent = -Math.abs(changePercent);
          }
        } catch (_) {}
      }

      return { currentPrice, changePercent };
    });
  } finally {
    await page.close().catch(() => {});
  }
}

async function scrapeTaseFallbackWithAxios(taseUrl) {
  const { data } = await axios.get(taseUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    timeout: 12000
  });
  const $ = cheerio.load(typeof data === 'string' ? data : '');
  const normalizeText = (t) => (t || '')
    .replace(/[\u2212\u2012\u2013\u2014]/g, '-')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ');
  const fullText = normalizeText($('body').text());
  const priceNumberRx = '(\\d[\\d\\s,.]*)';
  const priceMatch =
    fullText.match(new RegExp(`שער\\s*אחרון[^\\d]{0,80}${priceNumberRx}`)) ||
    fullText.match(new RegExp(`שווי\\s*יחידה[^\\d]{0,80}${priceNumberRx}`)) ||
    fullText.match(new RegExp(`שער\\s*פתיחה[^\\d]{0,80}${priceNumberRx}`));
  const percentToken = '([()\\-\\u2212\\d.\u2012\u2013\u2014\u200E\u200F]+?)';
  const percentMatch = fullText.match(new RegExp(`שינוי\\s*יומי[^%]{0,30}${percentToken}%`)) || fullText.match(new RegExp(`${percentToken}%`));
  const parsePriceToken = (token) => {
    if (!token) return null;
    const cleaned = token
      .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
      .replace(/\s+/g, '')
      .replace(/,/g, '');
    const num = parseFloat(cleaned);
    if (!Number.isFinite(num)) return null;
    return Math.round(num * 100);
  };
  const currentPrice = priceMatch ? parsePriceToken(priceMatch[1]) : null;
  const parsePercentToken = (token) => {
    if (!token) return null;
    const s = token.replace(/[\u2212\u2012\u2013\u2014]/g, '-');
    // negative if any '-' exists OR parentheses contain a number with optional '-'
    const isNegative = /-/.test(s) || /\(\s*-?\d/.test(s) && /\)/.test(s);
    const numMatch = s.match(/\d+(?:\.\d+)?/);
    if (!numMatch) return null;
    const val = parseFloat(numMatch[0]);
    return isNegative ? -val : val;
  };
  const rawToken = percentMatch ? percentMatch[1] : null;
  const changePercent = percentMatch ? parsePercentToken(rawToken) : null;
  // include raw for server-side log only
  return { currentPrice, changePercent, _rawPercentToken: rawToken };
}

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

  const taseUrl = `https://market.tase.co.il/he/market_data/security/${stockId}/major_data`;
  const quotePromise = (async () => {
    try {
      const result = await scrapeTaseWithPuppeteer(taseUrl);
      const payload = { currentPrice: result.currentPrice, changePercent: result.changePercent };
      if (payload.currentPrice === null || payload.changePercent === null) {
        console.warn('[tase] puppeteer returned partial/empty data', { stockId, payload });
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
        if (payload.currentPrice === null || payload.changePercent === null) {
          console.warn('[tase] axios fallback returned partial/empty data', { stockId, payload });
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
        return { currentPrice: null, changePercent: null };
      }
    }
  })();

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
