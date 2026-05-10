// taseScraper.js
// Real web-scraping of https://market.tase.co.il/he/market_data/security/<ID>/major_data
// using a headless browser (puppeteer), since the page is an Angular SPA and the
// price/change values do NOT exist in the initial HTML — they're rendered client-side.
//
// Public API:
//   await scrapeTaseMajorData(input)  →  { secId, securityName, lastRate, changePercent, source, url }
//   input may be either a numeric security id ("1159250" / "01159250") or a name
//   ("טבע", "TEVA"). For names, the scraper opens the TASE site search and follows
//   the first matching security.
//
//   await closeTaseBrowser()  →  shuts down the shared browser instance (used on
//   process exit / tests).

const puppeteer = require('puppeteer');

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const NAV_TIMEOUT_MS = Number(process.env.TASE_SCRAPE_NAV_TIMEOUT_MS || 30000);
const RENDER_TIMEOUT_MS = Number(process.env.TASE_SCRAPE_RENDER_TIMEOUT_MS || 25000);

// One shared browser per process — launching Chrome is the slow part.
let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer
      .launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-blink-features=AutomationControlled',
          '--lang=he-IL'
        ]
      })
      .catch((err) => {
        browserPromise = null;
        throw err;
      });
  }
  return browserPromise;
}

async function closeTaseBrowser() {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await b.close();
  } catch (_) {
    // ignore — we're tearing down anyway
  } finally {
    browserPromise = null;
  }
}

/**
 * Open a fresh page with sensible defaults: Hebrew locale, desktop UA,
 * and a request interceptor that drops images/fonts/media so the page renders
 * faster (we only care about textual data).
 */
async function newConfiguredPage() {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent(DEFAULT_USER_AGENT);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8' });
  await page.setViewport({ width: 1366, height: 850 });
  await page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const t = req.resourceType();
    if (t === 'image' || t === 'font' || t === 'media') {
      req.abort().catch(() => {});
    } else {
      req.continue().catch(() => {});
    }
  });

  return page;
}

function isAllDigits(s) {
  return /^\d+$/.test(String(s || '').trim());
}

/** Normalize "1159250" / "01159250" / "  159250 " → 7-digit zero-padded TASE id. */
function normalizeSecId(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(7, '0').slice(-7);
}

/**
 * Parse a Hebrew/Israeli numeric token from the TASE page.
 *
 * On this page commas are *always* thousands separators (e.g. "230,190" = 230190
 * agorot) and the period is the decimal separator (e.g. "0.05%"). We therefore
 * just strip commas / direction marks / percent / whitespace and parse as float.
 */
function parseHebrewNumber(token) {
  if (token == null) return null;
  let s = String(token)
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/[\u2212\u2012\u2013\u2014]/g, '-')
    .replace(/[%\s₪]/g, '')
    .replace(/,/g, '');
  if (!s) return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// Built-in alias map: free-text names → TASE security id.
// Extendable at runtime via env var TASE_NAME_ALIASES (JSON object), e.g.:
//   TASE_NAME_ALIASES={"רמי לוי":"1104248","מליסרון":"323014"}
//
// Note: TASE's global search page and autocomplete API are protected by Imperva
// and reject every headless / non-browser request with HTTP 403, so resolving an
// arbitrary name on the fly is not currently possible from a server. The alias
// map gives users the same "type a name" UX for the most common tickers.
const BUILTIN_NAME_ALIASES = {
  'טבע': '629014',
  'teva': '629014',
  'פועלים': '662577',
  'בנק פועלים': '662577',
  'לאומי': '604611',
  'בנק לאומי': '604611',
  'מזרחי': '695437',
  'בנק מזרחי טפחות': '695437',
  'דיסקונט': '691212',
  'בנק דיסקונט': '691212',
  'הבינלאומי': '593038',
  'בנק הבינלאומי': '593038',
  'נייס': '273011',
  'nice': '273011',
  'אלביט': '1081124',
  'אלביט מערכות': '1081124',
  'elbit': '1081124',
  'בזק': '230011',
  'שופרסל': '777037',
  'ת"א 35': '142',
  'ta35': '142',
  's&p 500': '1159250',
  'איישרס': '1159250'
};

function loadNameAliases() {
  const map = { ...BUILTIN_NAME_ALIASES };
  const raw = String(process.env.TASE_NAME_ALIASES || '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      for (const [k, v] of Object.entries(parsed)) {
        if (k && v != null) map[String(k).toLowerCase().trim()] = String(v).trim();
      }
    } catch (_) {
      // ignore malformed env override — fall back to builtin
    }
  }
  return map;
}

/**
 * Resolve a free-text query (e.g. "טבע", "TEVA") to a TASE security id using the
 * alias map. Throws a helpful error if the name is not in the map.
 */
async function resolveSecurityIdByName(query) {
  const map = loadNameAliases();
  const key = String(query || '').toLowerCase().trim();
  if (map[key]) return { secId: map[key], label: query };

  // Try a loose contains-match for partial names (e.g. "פועלים בע\"מ").
  for (const [aliasKey, secId] of Object.entries(map)) {
    if (key.includes(aliasKey) || aliasKey.includes(key)) {
      return { secId, label: query };
    }
  }

  throw new Error(
    `tase search: no built-in alias for "${query}". Pass the security id (digits) ` +
      `or extend TASE_NAME_ALIASES env var with {"${query}":"<secId>"}.`
  );
}

/**
 * Scrape the major_data page for a known security id and pull out
 * שער אחרון (last rate) + שינוי (change %).
 */
async function scrapeBySecId(secId) {
  const id = normalizeSecId(secId);
  if (!id) throw new Error('invalid security id');

  const url = `https://market.tase.co.il/he/market_data/security/${id}/major_data`;
  const page = await newConfiguredPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });

    // Wait until the SPA actually renders the price section. We require both the
    // label *and* a numeric value — the empty Angular shell often shows the label
    // immediately while the value is still loading from XHR.
    await page.waitForFunction(
      () => {
        const txt = document.body ? document.body.innerText || '' : '';
        if (!/שער\s*אחרון/.test(txt) || !/שינוי/.test(txt)) return false;
        const lines = txt.split('\n').map((l) => l.trim());
        const idx = lines.findIndex((l) => /שער\s*אחרון/.test(l));
        if (idx < 0) return false;
        for (let i = idx + 1; i < Math.min(idx + 4, lines.length); i += 1) {
          if (/^-?[\d.,]+$/.test(lines[i])) return true;
        }
        return false;
      },
      { timeout: RENDER_TIMEOUT_MS, polling: 250 }
    );

    const scraped = await page.evaluate(() => {
      const fullText = (document.body && document.body.innerText) || '';
      const lines = fullText.split('\n').map((l) => l.replace(/\s+/g, ' ').trim());

      // Walk the rendered text top-to-bottom — the page lays out every metric as
      // <label> on one line followed by <value> on the next.
      function nextNumericAfter(labelRegex, opts = {}) {
        const { withPercent = false, lookahead = 4 } = opts;
        const valueRegex = withPercent ? /^-?[\d.,]+\s*%$/ : /^-?[\d.,]+$/;
        for (let i = 0; i < lines.length; i += 1) {
          if (!labelRegex.test(lines[i])) continue;
          for (let j = i + 1; j < Math.min(i + 1 + lookahead, lines.length); j += 1) {
            if (valueRegex.test(lines[j])) {
              const trendLine = lines[j + 1] || '';
              return { value: lines[j], trend: trendLine };
            }
          }
        }
        return { value: null, trend: null };
      }

      const lastRateHit = nextNumericAfter(/^שער\s*אחרון(\s*\(.*?\))?$/, { withPercent: false });
      const changeHit = nextNumericAfter(/^שינוי$/, { withPercent: true });

      // The TASE site shows the change percent *unsigned* and indicates direction
      // with the Hebrew word "ירידה" (down) / "עלייה" (up) on the next line.
      // For "0%" both words may appear — we keep the value as 0.
      let changeText = changeHit.value;
      if (changeText && changeHit.trend) {
        if (changeHit.trend.includes('ירידה') && !/^-/.test(changeText)) {
          changeText = `-${changeText}`;
        }
      }

      const titleEl = document.querySelector('h1.content_heading_title') || document.querySelector('h1');
      const rawTitle = ((titleEl && titleEl.textContent) || document.title || '')
        .replace(/\s+/g, ' ')
        .trim();
      const securityName = rawTitle
        .replace(/\s*נתונים עיקריים\s*$/, '')
        .replace(/\s*\|\s*אתר הבורסה\s*$/, '')
        .trim();

      return {
        securityName,
        lastRateText: lastRateHit.value,
        changeText,
        changeTrend: changeHit.trend,
        textSample: lines.slice(0, 60)
      };
    });

    const lastRate = parseHebrewNumber(scraped.lastRateText);
    const changePercent = parseHebrewNumber(scraped.changeText);

    if (lastRate == null && changePercent == null) {
      const err = new Error('tase scrape: could not locate שער אחרון / שינוי on page');
      err.debug = scraped;
      throw err;
    }

    return {
      secId: id,
      url,
      securityName: scraped.securityName || null,
      lastRate,
      changePercent,
      trend: scraped.changeTrend || null,
      source: 'tase_html_scrape',
      raw: {
        lastRate: scraped.lastRateText,
        change: scraped.changeText
      }
    };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Main entry: takes either a TASE security id or a free-text name, returns the scraped quote.
 */
async function scrapeTaseMajorData(input) {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('tase scrape: empty query');

  let secId;
  let searchHit = null;

  if (isAllDigits(raw)) {
    secId = normalizeSecId(raw);
  } else {
    searchHit = await resolveSecurityIdByName(raw);
    secId = normalizeSecId(searchHit.secId);
  }

  const result = await scrapeBySecId(secId);
  if (searchHit && !result.securityName) result.securityName = searchHit.label;
  result.query = raw;
  return result;
}

module.exports = {
  scrapeTaseMajorData,
  scrapeBySecId,
  resolveSecurityIdByName,
  closeTaseBrowser,
  // exported for tests
  _internal: { normalizeSecId, parseHebrewNumber }
};
