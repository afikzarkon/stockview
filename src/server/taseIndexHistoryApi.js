// Historical daily closes for a TASE INDEX (TA-125, TA-35, TA-90,
// TA-Banks), via TASE's own public JSON REST API.
//
// A sibling of taseHistoryApi.js, which does the same for a SECURITY. They
// are deliberately separate modules because TASE serves them from separate
// endpoints and the security one does not answer for indices at all:
// POSTing an index id to /api/security/historyeod returns HTTP 200 with
// TotalRec 0 and an empty Items array - a silent empty answer rather than
// an error, which is exactly the kind of thing that looks like "the index
// has no data" when it actually means "wrong endpoint". Indices live at
// /api/index/historyeod, with the same request shape.
//
// WHY NOT YAHOO. Yahoo carries ^TA125.TA, TA35.TA and TA90.TA, but for
// TA-Banks it serves a current quote and exactly ONE historical point at
// every range from six months to five years - so a benchmark line could
// not be drawn at all. TASE returns 738 trading days for the same index
// over its three-year window. It is also the primary source for its own
// indices rather than a redistributor of them.
//
// THE TRADE-OFF, stated rather than discovered later: this endpoint's
// deepest window (pType 6) is three years. Yahoo reaches further back. A
// comparison over a longer range than that is therefore limited by the
// benchmark rather than by the portfolio - buildComparisonSeries already
// handles a benchmark that starts later than the portfolio by beginning
// the comparison at the first common date, so the effect is a shorter
// comparison, not a wrong one.
const axios = require('axios');
const { taseDateToIso } = require('./taseHistoryApi');

const TASE_INDEX_HISTORY_URL = 'https://api.tase.co.il/api/index/historyeod';
const PAGE_SIZE = 30;
const PTYPE_THREE_YEARS = 6;
// 3 years of trading days is ~750 at 30/page = 25 pages, plus one page of
// margin against an off-by-one edge. Matches taseHistoryApi.js.
const MAX_PAGES = 26;

// The index ids this app knows about, each confirmed against the live
// endpoint by matching its latest close to the same index's value from an
// independent source. Zero-padded to 8 digits by toOid below, exactly as
// the security endpoint expects its oId.
const TASE_INDEX_IDS = {
  ta125: 137,
  ta35: 142,
  ta90: 143,
  taBanks: 164
};

const BROWSER_HEADERS = {
  'Content-Type': 'application/json;charset=UTF-8',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'he-IL',
  Referer: 'https://market.tase.co.il/'
};

function toOid(indexId) {
  return String(indexId).padStart(8, '0');
}

async function fetchIndexHistoryPage(indexId, pageNum, pType = PTYPE_THREE_YEARS) {
  const response = await axios.post(
    TASE_INDEX_HISTORY_URL,
    { pType, oId: toOid(indexId), TotalRec: 1, pageNum, lang: '0' },
    { timeout: 15000, headers: BROWSER_HEADERS }
  );
  return response.data;
}

// Pages backward from today until fromDateStr (YYYY-MM-DD) is reached, or
// the three-year window / server-reported TotalRec is exhausted.
//
// Returns { date, close }[] ascending and deduplicated by date - the same
// shape as fetchYahooHistoricalCloses and fetchTaseHistoricalCloses, so a
// benchmark from either source is interchangeable to every caller above
// this line.
//
// An index level is a plain number, NOT agorot: unlike a security's
// CloseRate, there is no unit conversion to apply here, and applying one
// would scale the whole benchmark by 100. It doesn't matter to a comparison
// that re-bases both series to 100, but it would matter to anything reading
// the level itself, so the value is passed through untouched.
async function fetchTaseIndexHistoricalCloses(indexId, fromDateStr) {
  const closesByDate = new Map();
  let pageNum = 1;
  let totalRec = null;
  let totalFetched = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const data = await fetchIndexHistoryPage(indexId, pageNum);
    const items = Array.isArray(data.Items) ? data.Items : [];
    if (totalRec === null) totalRec = Number(data.TotalRec) || items.length;
    if (items.length === 0) break;
    totalFetched += items.length;

    let reachedFromDate = false;
    for (const item of items) {
      const isoDate = taseDateToIso(item.TradeDate);
      // Number(null) is 0, not NaN - testing isFinite on the RAW value is
      // what rejects a missing rate instead of recording a 0 close.
      if (isoDate && Number.isFinite(item.CloseRate)) {
        closesByDate.set(isoDate, item.CloseRate);
      }
      if (fromDateStr && isoDate && isoDate <= fromDateStr) {
        reachedFromDate = true;
      }
    }

    if (reachedFromDate) break;
    if (totalFetched >= totalRec) break;
    if (pageNum >= MAX_PAGES) break;
    pageNum += 1;
  }

  return Array.from(closesByDate.entries())
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

module.exports = {
  fetchTaseIndexHistoricalCloses,
  TASE_INDEX_IDS,
  TASE_INDEX_HISTORY_URL,
  PAGE_SIZE
};
