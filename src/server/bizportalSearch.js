// Israeli/TASE security search by free-text name, via Bizportal's own
// public autocomplete endpoint (the one powering the "חיפוש ניירות ערך"
// box on bizportal.co.il). Confirmed by capturing real browser network
// traffic during development: typing into that box POSTs to
// papers_auto_suggest.ashx and gets back a JSON array of
// {PaperId, PaperName, PaperSymbol, PaperLink, PaperType, IS_foreign} -
// PaperId IS the TASE security id for domestic securities (verified
// against Teva: PaperId "629014" matches the id already used elsewhere
// in this app to scrape Teva's TASE quote page).
//
// The endpoint requires a session cookie (set by any normal page load,
// e.g. the homepage) - a request without it returns an EMPTY body with a
// plain 200 status, not an error, so a stale/missing cookie is
// indistinguishable from "no results" on the first attempt. One
// forced-refresh retry resolves that ambiguity cheaply.
//
// This is an unofficial, undocumented endpoint - like the Yahoo
// crumb/cookie dance in yahooCrumb.js, Bizportal could change or remove it
// without notice. Callers (quotesRoutes.js) treat a failure here as
// "no results", never as a hard error.
const axios = require('axios');

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7'
};

const COOKIE_TTL_MS = 30 * 60 * 1000;
let cached = null; // { cookie, ts }
let inFlightCookie = null;

function extractCookieHeader(setCookieHeaders) {
  if (!setCookieHeaders) return '';
  const list = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return list
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

async function fetchSessionCookie() {
  const response = await axios.get('https://www.bizportal.co.il/', {
    headers: BROWSER_HEADERS,
    timeout: 12000
  });
  const cookie = extractCookieHeader(response.headers['set-cookie']);
  if (!cookie) throw new Error('could not obtain a bizportal session cookie');
  return cookie;
}

async function getBizportalCookie(forceRefresh = false) {
  if (!forceRefresh && cached && Date.now() - cached.ts < COOKIE_TTL_MS) {
    return cached.cookie;
  }
  if (inFlightCookie) return inFlightCookie;

  inFlightCookie = (async () => {
    const cookie = await fetchSessionCookie();
    cached = { cookie, ts: Date.now() };
    return cookie;
  })();

  try {
    return await inFlightCookie;
  } finally {
    inFlightCookie = null;
  }
}

// Exposed for tests and for quotesRoutes.js's caller to invalidate after a
// downstream failure it can observe but this module can't (e.g. a 401).
function invalidateBizportalCookie() {
  cached = null;
}

async function requestAutoSuggest(query, cookie) {
  const response = await axios.post(
    `https://www.bizportal.co.il/ajax/papers_auto_suggest.ashx?QueryString=${encodeURIComponent(query)}`,
    null,
    {
      timeout: 10000,
      headers: {
        ...BROWSER_HEADERS,
        Cookie: cookie,
        Referer: 'https://www.bizportal.co.il/',
        'X-Requested-With': 'XMLHttpRequest'
      }
    }
  );
  return response.data;
}

// Domestic (non-foreign-listed) TASE securities a user can actually hold in
// this app: ordinary shares ("מניות"), exchange-traded funds ("קרנות סל")
// and mutual funds / index trackers ("קרנות נאמנות"). The raw endpoint also
// matches indices ("מדדי חו\"ל", "מדדים" - not holdable instruments, just
// reference series), bonds and foreign-listed stocks against the same query
// text, none of which belong in an "Israeli security" search result.
//
// "קרנות נאמנות" used to be excluded here on the grounds that a mutual fund
// isn't exchange-traded and so has no live quote to scrape. That is the
// wrong trade-off: users DO hold index-tracking mutual funds (searching
// "מחקה" returns nothing else), and a holding whose live price can't be
// resolved still shows its purchase data correctly rather than being
// unaddable. Confirmed live: "תכלית" returns 5 קרנות סל + 5 קרנות נאמנות,
// "מחקה" returns 10 קרנות נאמנות and previously produced an empty result.
//
// PaperId "0" is Bizportal's placeholder for entries that carry no real
// TASE security id (seen on some foreign-stock rows).
const HOLDABLE_PAPER_TYPES = new Set(['מניות', 'קרנות סל', 'קרנות נאמנות']);

// Bizportal's own URL segment per instrument class - a more reliable
// classification than re-parsing the Hebrew type string downstream.
const PAPER_TYPE_KIND = {
  מניות: 'stock',
  'קרנות סל': 'etf',
  'קרנות נאמנות': 'mutualFund'
};

function isHoldableSecurityEntry(entry) {
  return Boolean(
    entry &&
      HOLDABLE_PAPER_TYPES.has(entry.PaperType) &&
      String(entry.IS_foreign) === '0' &&
      entry.PaperId &&
      String(entry.PaperId) !== '0'
  );
}

async function searchIsraeliSecuritiesByName(query) {
  const trimmed = (query || '').trim();
  if (!trimmed) return [];

  let cookie = await getBizportalCookie();
  let data = await requestAutoSuggest(trimmed, cookie);

  if (!Array.isArray(data) || data.length === 0) {
    invalidateBizportalCookie();
    cookie = await getBizportalCookie(true);
    data = await requestAutoSuggest(trimmed, cookie);
  }

  if (!Array.isArray(data)) return [];

  return data.filter(isHoldableSecurityEntry).map((entry) => ({
    securityId: String(entry.PaperId),
    officialName: entry.PaperName,
    symbol: entry.PaperSymbol || null,
    kind: PAPER_TYPE_KIND[entry.PaperType] || null,
    isFund: entry.PaperType !== 'מניות'
  }));
}

module.exports = {
  searchIsraeliSecuritiesByName,
  invalidateBizportalCookie,
  isHoldableSecurityEntry,
  HOLDABLE_PAPER_TYPES
};
