// Resolve a single TASE security by its numeric security id ("מספר נייר"),
// returning everything the app needs to identify and classify it: the
// official Hebrew name, the trading symbol, whether it's a fund/ETF or an
// ordinary share, whether it tracks foreign markets, and the exchange's own
// branch/industry string.
//
// Same endpoint as taseQuoteApi.js (api.tase.co.il/api/company/securitydata),
// which already proved it answers for ANY security id - shares, ETFs and
// foreign-listed tracking funds alike. taseQuoteApi.js only reads the two
// price fields off it; this module reads the identity/classification fields
// off the same response, which is what makes searching by security number
// work for the instruments Bizportal's name-autocomplete simply doesn't
// carry (verified: id 1159250, "איישרס.חוץ P 500&S", returns nothing at all
// from Bizportal but resolves here with full metadata).
//
// Response fields used (confirmed live against ids 1159250 and 629014):
//   Name            - short Hebrew name, e.g. "איישרס.חוץ P 500&S" / "טבע"
//   LongName        - full name where the exchange has one, e.g.
//                     "ISHARES CORE S&P 500 UCITS ETF" (null for many shares)
//   Symbol          - trading symbol, e.g. "אש.סז702" / "טבע"
//   Type            - "קרן חוץ נסחרת" / " מניות" (note the leading space)
//   SecuritySubType - "קרן חוץ נסחרת מניות" / "מניה רגילה"
//   FullBranch      - the exchange's own branch path, e.g.
//                     "הייטק-ביומד-פארמה" - the sector source for shares
//   IsForeignETF    - true for a foreign-listed tracking fund
//   UAssetName      - the tracked underlying asset, e.g. "S&P 500 - NTR"
//   ISIN            - an IL* prefix means domestically issued
const axios = require('axios');

const TASE_SECURITY_URL = 'https://api.tase.co.il/api/company/securitydata';

// Referer is the one header this endpoint requires - see taseQuoteApi.js's
// note for how that was established (no headers -> 403, Referer alone -> 200).
const REQUEST_HEADERS = {
  Referer: 'https://market.tase.co.il/',
  'Accept-Language': 'he-IL'
};

const REQUEST_TIMEOUT_MS = 10000;

// A TASE security id is numeric and, in practice, 3-9 digits (the API
// itself zero-pads to 8). Used to decide whether a search box's text is a
// security number or a name.
const SECURITY_ID_RE = /^\d{3,9}$/;

function isSecurityIdQuery(query) {
  return SECURITY_ID_RE.test(String(query || '').trim());
}

// Fund-like instruments: ETFs ("קרנות סל"), foreign-listed tracking funds
// ("קרן חוץ נסחרת"), mutual funds ("קרנות נאמנות") and index trackers
// ("מחקה מדד"). Matched against Type + SecuritySubType together, which is
// what actually distinguishes them from "מניה רגילה".
const FUND_TYPE_KEYWORDS = ['קרן', 'קרנות', 'סל', 'מחקה', 'מדד', 'ETF'];

function looksLikeFund(...typeStrings) {
  const haystack = typeStrings.filter(Boolean).join(' ').toUpperCase();
  return FUND_TYPE_KEYWORDS.some((kw) => haystack.includes(kw.toUpperCase()));
}

// The exchange's own FullBranch is a dash-separated path, coarsest first:
// "הייטק-ביומד-פארמה", "מכשירים פיננסים-קרן חוץ נסחרת-קרן חוץ נסחרת". The
// leaf is the most specific description, which is the useful one for a
// sector label.
function branchLeaf(fullBranch) {
  const parts = String(fullBranch || '')
    .split('-')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

// Normalizes one securitydata response into the shape the rest of the app
// consumes. Returns null for an unknown id: the API answers HTTP 200 with a
// literal `null` body rather than a 404 (same quirk taseQuoteApi.js guards
// against), so "no such security" has to be detected from the body.
function normalizeSecurityData(securityId, data) {
  if (!data || typeof data !== 'object') return null;

  const name = (data.Name || data.CompanyName || '').trim();
  const longName = (data.LongName || '').trim();
  if (!name && !longName) return null;

  const type = (data.Type || '').trim();
  const subType = (data.SecuritySubType || '').trim();
  const isFund = looksLikeFund(type, subType);

  return {
    // String, zero-padding stripped - the id the app stores on a holding
    // and uses for quotes (Id comes back as "01159250").
    securityId: String(data.Id || securityId).replace(/^0+/, '') || String(securityId),
    officialName: name || longName,
    longName: longName || null,
    symbol: (data.Symbol || '').trim() || null,
    securityType: type || null,
    securitySubType: subType || null,
    branch: (data.FullBranch || '').trim() || null,
    branchLeaf: branchLeaf(data.FullBranch),
    isFund,
    // The exchange's own flag for a foreign-listed tracking fund. Combined
    // with the name heuristic (utils/israeliEtfClassifier.js) on the client
    // rather than replacing it - this only covers foreign-LISTED funds, not
    // a TASE-listed ETF that happens to track the S&P 500.
    isForeignETF: data.IsForeignETF === true,
    underlyingAsset: (data.UAssetName || '').trim() || null,
    isin: (data.ISIN || '').trim() || null
  };
}

async function fetchTaseSecurityMeta(securityId) {
  const response = await axios.get(TASE_SECURITY_URL, {
    params: { securityId: String(securityId), lang: 0 },
    timeout: REQUEST_TIMEOUT_MS,
    headers: REQUEST_HEADERS
  });
  return normalizeSecurityData(securityId, response.data);
}

module.exports = {
  fetchTaseSecurityMeta,
  isSecurityIdQuery,
  normalizeSecurityData,
  branchLeaf,
  looksLikeFund,
  SECURITY_ID_RE
};
