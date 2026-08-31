// Official TASE Data Hub API ("Securities Prices - Online (15-minute
// delay)" product) - replaces the fragile Puppeteer-based scraping in
// taseScraper.js with a real, documented, stable REST API, IF a
// TASE_API_KEY is configured and the product has been approved
// (registrations start in a "PENDING" state in the developer portal and
// need TASE's Data Sales Team to activate them before calls succeed).
//
// quotesRoutes.js tries this first and only falls back to the Puppeteer
// scraper if it isn't configured or fails - so nothing breaks while
// waiting for approval, and nothing needs to change in the app once it's
// approved, it just starts working.
const axios = require('axios');

const TASE_API_BASE_URL = 'https://datawise.tase.co.il';
const TASE_API_TIMEOUT_MS = 8000;

function isTaseApiConfigured() {
  return Boolean(process.env.TASE_API_KEY);
}

// One retry after a short backoff on 429 - TASE's documented limit (10
// requests / 2 seconds, globally per key) is generous for this app's
// usage, but a brief burst (e.g. several browser tabs polling at once) can
// still hit it momentarily.
async function fetchTaseQuoteFromApi(securityId) {
  if (!isTaseApiConfigured()) {
    throw new Error('TASE_API_KEY not configured');
  }

  const doRequest = () =>
    axios.get(`${TASE_API_BASE_URL}/v1/securities-trading-data/last-updated`, {
      params: { securityId },
      timeout: TASE_API_TIMEOUT_MS,
      headers: {
        apikey: process.env.TASE_API_KEY,
        'accept-language': 'he-IL',
        Accept: 'application/json'
      }
    });

  let response;
  try {
    response = await doRequest();
  } catch (err) {
    const status = err.response && err.response.status;
    if (status === 429) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      response = await doRequest();
    } else {
      throw err;
    }
  }

  const result = response?.data?.securitiesLastUpdate?.result;
  const entry = Array.isArray(result) ? result[0] : null;
  if (!entry) {
    throw new Error('missing data in TASE API response');
  }

  const currentPrice = Number(entry.securityLastPrice);
  const changePercent = Number(entry.securityPercentageChange);
  if (!Number.isFinite(currentPrice) || !Number.isFinite(changePercent)) {
    throw new Error('non-numeric price/change in TASE API response');
  }

  // Already in agorot (e.g. 1538 = 15.38 ILS) - the same convention the
  // rest of the app already expects from the Puppeteer scraper (see
  // taseScraper.js's parsePriceToken), so no conversion needed here.
  return { currentPrice, changePercent };
}

module.exports = { isTaseApiConfigured, fetchTaseQuoteFromApi };
