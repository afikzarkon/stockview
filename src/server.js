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

const TASE_CACHE_TTL_MS = 45 * 1000;
const PUPPETEER_TIMEOUT_MS = 12000;
const taseCache = new Map();

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label || 'operation'} timeout`)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function scrapeTaseWithPuppeteer(taseUrl) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  await page.goto(taseUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  try {
    await page.waitForFunction(() => /שווי\s*יחידה|%/.test((document.body.innerText || '').replace(/\s+/g, ' ')), { timeout: 20000 });
  } catch (_) {
    await new Promise((r) => setTimeout(r, 2000));
  }
  const result = await page.evaluate(() => {
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
    // find context around token for debugging (not returned to client, only for server log)
    let context = null;
    if (percentMatch && percentMatch.index !== undefined) {
      const start = Math.max(0, percentMatch.index - 40);
      const end = Math.min(text.length, percentMatch.index + (percentMatch[0] ? percentMatch[0].length : 0) + 40);
      context = text.slice(start, end);
    }
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
          const text = (el.textContent || '').toLowerCase();
          const negWord = /(ירידה|שלילי|minus|neg|down|ירד|אדום)/.test(cls + ' ' + title + ' ' + aria + ' ' + text);
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
  await browser.close();
  return result;
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
  const cacheKey = String(stockId || '').trim();
  if (!cacheKey) return res.json({ currentPrice: null, changePercent: null });
  const cached = taseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`[israeli-stock:${cacheKey}] cache_hit`);
    return res.json(cached.payload);
  }

  const taseUrl = `https://market.tase.co.il/he/market_data/security/${stockId}/major_data`;
  console.log(`[israeli-stock:${cacheKey}] fetch_start`);
  try {
    const result = await withTimeout(
      scrapeTaseWithPuppeteer(taseUrl),
      PUPPETEER_TIMEOUT_MS,
      'tase puppeteer'
    );
    const payload = { currentPrice: result.currentPrice, changePercent: result.changePercent };
    taseCache.set(cacheKey, { payload, expiresAt: Date.now() + TASE_CACHE_TTL_MS });
    console.log(
      `[israeli-stock:${cacheKey}] puppeteer_ok price=${payload.currentPrice} change=${payload.changePercent}`
    );
    return res.json(payload);
  } catch (err) {
    console.warn(
      `[israeli-stock:${cacheKey}] puppeteer_fail ${err && err.message ? err.message : err}`
    );
    try {
      const result = await scrapeTaseFallbackWithAxios(taseUrl);
      const payload = { currentPrice: result.currentPrice, changePercent: result.changePercent };
      taseCache.set(cacheKey, { payload, expiresAt: Date.now() + TASE_CACHE_TTL_MS });
      console.log(
        `[israeli-stock:${cacheKey}] axios_ok price=${payload.currentPrice} change=${payload.changePercent} raw=${result._rawPercentToken || 'n/a'}`
      );
      return res.json(payload);
    } catch (e2) {
      console.error(
        `[israeli-stock:${cacheKey}] axios_fail ${e2 && e2.message ? e2.message : e2}`
      );
      return res.json({ currentPrice: null, changePercent: null });
    }
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
