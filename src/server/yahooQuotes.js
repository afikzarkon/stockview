// Yahoo Finance quote fetching (used for both US stock prices and the
// USD/ILS exchange rate). Extracted from server.js — behavior is
// unchanged, only the location moved.
const axios = require('axios');
const { getYahooCrumbAndCookie, invalidateYahooCrumb } = require('./yahooCrumb');

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
    // Deliberately NOT reading meta.regularMarketChangePercent /
    // changePercent / regularMarketChange / change here. Real Yahoo v8
    // chart responses (verified against current sample data, not just
    // assumed) very often omit these fields entirely - they properly
    // belong to the older v7/finance/quote endpoint - and when one *is*
    // present its meaning is ambiguous: regularMarketChange/change are
    // absolute currency amounts (e.g. $2.34), not percentages, while
    // *ChangePercent fields' scale (fraction like 0.0142 vs already a
    // percent like 1.42) isn't consistent either. The previous code
    // multiplied whichever field it found by 100 regardless, which - if
    // it ever hit an absolute change field, or a field already in percent
    // form - produced numbers with no real relationship to the actual
    // daily % change (this matched a real production report of "wrong"
    // change percentages).
    //
    // previousClose and regularMarketPrice are both unambiguous absolute
    // prices in the same currency, so computing the % change directly
    // from them has no unit-mismatch risk.
    const previousClose = Number(meta.previousClose ?? meta.chartPreviousClose);

    let finalChangePercent = 0;
    if (Number.isFinite(currentPrice) && Number.isFinite(previousClose) && previousClose !== 0) {
      finalChangePercent = ((currentPrice - previousClose) / previousClose) * 100;
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

// Shared fetch+parse for the v8/finance/chart daily-bars endpoint, given
// explicit unix-second bounds. fetchYahooHistoricalCloses and
// fetchYahooHistoricalRateForDate below just pick different bounds.
async function fetchYahooDailyCloses(symbol, period1, period2) {
  const encoded = encodeURIComponent(symbol);
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

// Daily closing prices for a symbol between fromDateStr (YYYY-MM-DD, or ~13
// months back if omitted) and today. Used for benchmark comparison
// (^GSPC / ^TA125.TA) — a different endpoint shape than getYahooPayload
// above (full timestamp+close arrays instead of just the latest meta), so
// it's a separate function rather than reusing fetchYahooChartMeta.
async function fetchYahooHistoricalCloses(symbol, fromDateStr) {
  const period1 = fromDateStr
    ? Math.floor(new Date(`${fromDateStr}T00:00:00Z`).getTime() / 1000)
    : Math.floor(Date.now() / 1000) - 400 * 24 * 60 * 60;
  const period2 = Math.floor(Date.now() / 1000);
  return fetchYahooDailyCloses(symbol, period1, period2);
}

// The historical rate for a symbol on one specific date (e.g. "USDILS=X"
// on the day a US stock was bought) - used to auto-fill the exchange-rate
// field on the "add stock" form instead of requiring the user to look it
// up and type it in. Fetches just a narrow window around the requested
// date (not fromDateStr-to-today like fetchYahooHistoricalCloses above,
// which would pull years of unneeded daily bars for an old purchase
// date), then picks the latest trading day at or before it - FX has no
// bar on weekends/holidays, so "the rate that day" means "the last known
// rate as of that day". Returns null (never a guessed/fabricated rate)
// when nothing on or before the date falls within the window.
async function fetchYahooHistoricalRateForDate(symbol, dateStr) {
  const target = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return null;
  const period1 = Math.floor(target.getTime() / 1000) - 7 * 24 * 60 * 60;
  const period2 = Math.floor(target.getTime() / 1000) + 24 * 60 * 60;

  const points = await fetchYahooDailyCloses(symbol, period1, period2);
  const onOrBefore = points.filter((p) => p.date <= dateStr);
  if (onOrBefore.length === 0) return null;
  const closest = onOrBefore[onOrBefore.length - 1]; // points is sorted ascending by date
  return { date: closest.date, rate: closest.close };
}

// Recent news headlines for a US stock, via Yahoo's public search endpoint
// (same "no crumb/cookie needed" family as fetchYahooHistoricalCloses
// above — confirmed with a real request during development: works with
// just a User-Agent header, unlike the quoteSummary-based functions
// below). quotesCount:0 skips the ticker/company autocomplete results
// this endpoint also returns, which aren't needed here.
async function fetchYahooNews(symbol, count = 10) {
  const response = await axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
    params: { q: symbol, newsCount: count, quotesCount: 0 },
    timeout: 15000,
    headers: YAHOO_HEADERS
  });

  const news = response?.data?.news;
  if (!Array.isArray(news)) return [];

  return news
    .map((item) => ({
      uuid: item.uuid || null,
      title: item.title || null,
      publisher: item.publisher || null,
      link: item.link || null,
      publishedAtEpoch: unwrapYahooNumber(item.providerPublishTime),
      relatedTickers: Array.isArray(item.relatedTickers) ? item.relatedTickers : []
    }))
    .filter((item) => item.uuid && item.title && item.link);
}

// Ticker/company autocomplete suggestions, via the same public search
// endpoint as fetchYahooNews above — quotesCount (not newsCount) this time.
// No crumb/cookie needed, same as fetchYahooNews.
async function fetchYahooSymbolSearch(query, count = 8) {
  const response = await axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
    params: { q: query, newsCount: 0, quotesCount: count },
    timeout: 15000,
    headers: YAHOO_HEADERS
  });

  const quotes = response?.data?.quotes;
  if (!Array.isArray(quotes)) return [];

  return quotes
    .filter((q) => q.quoteType === 'EQUITY' && q.symbol)
    .map((q) => ({
      symbol: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      exchange: q.exchDisp || q.exchange || null
    }));
}

// Sector/industry classification for a US stock (module=assetProfile),
// used for the "diversification by sector" breakdown - a very different
// question from "how much is it worth" (exchangeDistribution): someone can
// hold 10 different US tickers and still be 90% concentrated in one
// sector, which the exchange-only breakdown can't show.
//
// quoteSummary (unlike the plain chart endpoint above) requires a
// crumb+cookie session - see yahooCrumb.js. If a cached crumb has gone
// stale (401), this retries once with a freshly-fetched one, the same
// "retry once on a transient/stale-auth failure" pattern already used for
// the TASE scraper in quotesRoutes.js.
//
// It's also rate-limited: sectorRoutes.js and analystRoutes.js each
// resolve every unique US ticker in the portfolio via Promise.all, so a
// portfolio with ~10 holdings can fire ~20 near-simultaneous requests at
// this same endpoint (sectors + analyst data, per symbol). Yahoo responds
// to bursts like that with 429s. QUOTE_SUMMARY_MIN_SPACING_MS serializes
// every quoteSummary call (across both features - this queue is
// module-level, not per-caller) through one queue with a minimum gap
// between requests, and a 429 gets one backoff-and-retry, the same as a
// stale crumb does.
const QUOTE_SUMMARY_MIN_SPACING_MS = 350;
const QUOTE_SUMMARY_429_BACKOFF_MS = 1500;
let quoteSummaryQueueTail = Promise.resolve();

function scheduleOnQuoteSummaryQueue(task) {
  // .finally() (not .then()) so the spacing delay applies whether the
  // request succeeded OR failed - a burst of failures (e.g. repeated
  // 429s) still needs pacing between attempts just as much as a burst of
  // successes does. .finally() also preserves the original
  // resolution/rejection for the caller, it doesn't swallow it.
  const run = quoteSummaryQueueTail.then(() =>
    task().finally(() => new Promise((resolve) => setTimeout(resolve, QUOTE_SUMMARY_MIN_SPACING_MS)))
  );
  // The queue's tail always resolves (never rejects), even if `task`
  // itself throws - otherwise one failed request would permanently jam
  // every request queued behind it.
  quoteSummaryQueueTail = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

// Shared by every crumb-authenticated Yahoo endpoint (quoteSummary below,
// and fetchYahooFundamentalsTimeseries further down - same auth, same
// rate-limit behavior, verified against real responses for both): retries
// once with a freshly-fetched crumb on a stale-auth failure (401/403),
// retries once more after a short backoff on a burst-rate-limit failure
// (429), and always goes through the shared queue so concurrent callers
// don't fire requests at Yahoo back-to-back.
async function fetchYahooWithCrumbRetry(url, extraParams) {
  const doRequest = async (forceRefreshCrumb) => {
    const { crumb, cookie } = await getYahooCrumbAndCookie(forceRefreshCrumb);
    return axios.get(url, {
      // formatted=false asks Yahoo for plain numbers (e.g. targetMeanPrice:
      // 150.5) instead of its default display-ready shape
      // ({ raw: 150.5, fmt: "150.50" }) - without this, every numeric field
      // silently becomes an object and fails a plain Number.isFinite()
      // check downstream.
      params: { ...extraParams, crumb, formatted: false },
      timeout: 12000,
      headers: { ...YAHOO_HEADERS, Cookie: cookie }
    });
  };

  const attemptWithCrumbRetry = async () => {
    try {
      return await doRequest(false);
    } catch (err) {
      const status = err.response && err.response.status;
      if (status === 401 || status === 403) {
        invalidateYahooCrumb();
        return await doRequest(true);
      }
      throw err;
    }
  };

  try {
    return await scheduleOnQuoteSummaryQueue(attemptWithCrumbRetry);
  } catch (err) {
    const status = err.response && err.response.status;
    if (status === 429) {
      // Back off briefly and retry once, outside the immediate queue
      // position - a short burst of concurrent symbol lookups is the
      // typical cause here, not a sustained block.
      await new Promise((resolve) => setTimeout(resolve, QUOTE_SUMMARY_429_BACKOFF_MS));
      return await scheduleOnQuoteSummaryQueue(attemptWithCrumbRetry);
    }
    throw err;
  }
}

async function fetchYahooQuoteSummary(symbol, modules) {
  const encoded = encodeURIComponent(symbol);
  const yahooUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encoded}`;
  const response = await fetchYahooWithCrumbRetry(yahooUrl, { modules });

  const result = response?.data?.quoteSummary?.result;
  if (!Array.isArray(result) || result.length === 0) {
    throw new Error('missing yahoo quoteSummary data');
  }
  return result[0];
}

// Real historical financial-statement line items (EPS, EBIT, invested
// capital, net income, total assets - see FUNDAMENTALS_TIMESERIES_TYPES),
// via Yahoo's newer fundamentals-timeseries endpoint (what yahoo finance's
// own site currently uses for its Financials tab). Verified during
// development against a real KO request: this genuinely works and returns
// 4+ years of populated data, unlike quoteSummary's balanceSheetHistory/
// incomeStatementHistory modules, which return empty statement shells
// (dates only, no actual figures) for real tickers - this replaces those
// for every multi-year trend check in stockScorecard.js's Past Performance
// category.
const FUNDAMENTALS_TIMESERIES_TYPES = [
  'annualDilutedEPS',
  'annualEBIT',
  'annualInvestedCapital',
  'annualNetIncome',
  'annualTotalAssets',
  // Added for the "phase 2" data-depth visualizations (revenue/cost donut,
  // revenue trend bar, balance-sheet treemap, DCF free-cash-flow input) -
  // every one of these was verified during development to return real,
  // populated data (not empty shells) for real tickers via this endpoint,
  // same as the original 5 types above.
  'annualTotalRevenue',
  'annualCostOfRevenue',
  'annualOperatingExpense',
  'annualTaxProvision',
  'annualPretaxIncome',
  'annualInterestExpense',
  'annualFreeCashFlow',
  'annualOperatingCashFlow',
  'annualCapitalExpenditure',
  'annualCashAndCashEquivalents',
  'annualCurrentAssets',
  'annualCurrentLiabilities',
  'annualTotalLiabilitiesNetMinorityInterest',
  'annualCurrentDebt',
  'annualLongTermDebt',
  'annualStockholdersEquity',
  'annualWorkingCapital',
  'annualNetPPE',
  'annualGoodwillAndOtherIntangibleAssets',
  'annualRetainedEarnings'
];

async function fetchYahooFundamentalsTimeseries(symbol) {
  const encoded = encodeURIComponent(symbol);
  const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encoded}`;
  const period1 = Math.floor(Date.now() / 1000) - 6 * 365 * 24 * 60 * 60; // ~6y back - a margin over the 5y trend the checks want
  const period2 = Math.floor(Date.now() / 1000);

  const response = await fetchYahooWithCrumbRetry(url, {
    type: FUNDAMENTALS_TIMESERIES_TYPES.join(','),
    period1,
    period2
  });

  const results = response?.data?.timeseries?.result;
  if (!Array.isArray(results)) return {};

  const byType = {};
  results.forEach((entry) => {
    const type = entry?.meta?.type?.[0];
    if (!type) return;
    // Yahoo intersperses null placeholders for periods with no reported
    // value (rather than omitting them) - filter those out rather than
    // letting a null break the sort/consumers below.
    byType[type] = (entry[type] || [])
      .filter(Boolean)
      .map((point) => ({ date: point.asOfDate, value: unwrapYahooNumber(point.reportedValue) }))
      .filter((point) => point.date && point.value !== null)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  });
  return byType;
}


// Defensive fallback for the { raw, fmt, longFmt } shape above, in case a
// given field ignores formatted=false (this has happened with Yahoo's
// unofficial API before, inconsistently, per-field) - unwraps either shape
// instead of silently discarding the value.
function unwrapYahooNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'object' && Number.isFinite(value.raw)) return value.raw;
  return null;
}

async function fetchYahooAssetProfile(symbol) {
  const quoteSummary = await fetchYahooQuoteSummary(symbol, 'assetProfile');
  const profile = quoteSummary?.assetProfile;
  if (!profile) {
    throw new Error('missing yahoo assetProfile data');
  }
  return {
    sector: profile.sector || null,
    industry: profile.industry || null
  };
}

// Analyst coverage for a US stock: consensus rating, price targets, and
// recent upgrade/downgrade history. Same quoteSummary endpoint/auth as
// fetchYahooAssetProfile above, different modules.
async function fetchYahooAnalystData(symbol) {
  const quoteSummary = await fetchYahooQuoteSummary(
    symbol,
    'financialData,recommendationTrend,upgradeDowngradeHistory'
  );

  const financialData = quoteSummary?.financialData || {};
  const recommendationTrend = quoteSummary?.recommendationTrend?.trend || [];
  const upgradeHistoryRaw = quoteSummary?.upgradeDowngradeHistory?.history || [];

  const upgradeHistory = upgradeHistoryRaw
    .map((entry) => ({
      firm: entry.firm || null,
      toGrade: entry.toGrade || null,
      fromGrade: entry.fromGrade || null,
      action: entry.action || null,
      epochGradeDate: unwrapYahooNumber(entry.epochGradeDate)
    }))
    .filter((entry) => entry.epochGradeDate !== null)
    .sort((a, b) => b.epochGradeDate - a.epochGradeDate)
    .slice(0, 8);

  const rawCurrentTrend = recommendationTrend.find((t) => t.period === '0m') || recommendationTrend[0] || null;
  const currentTrend = rawCurrentTrend
    ? {
        period: rawCurrentTrend.period || null,
        strongBuy: unwrapYahooNumber(rawCurrentTrend.strongBuy),
        buy: unwrapYahooNumber(rawCurrentTrend.buy),
        hold: unwrapYahooNumber(rawCurrentTrend.hold),
        sell: unwrapYahooNumber(rawCurrentTrend.sell),
        strongSell: unwrapYahooNumber(rawCurrentTrend.strongSell)
      }
    : null;

  return {
    recommendationKey: financialData.recommendationKey || null,
    numberOfAnalystOpinions: unwrapYahooNumber(financialData.numberOfAnalystOpinions),
    targetMeanPrice: unwrapYahooNumber(financialData.targetMeanPrice),
    targetHighPrice: unwrapYahooNumber(financialData.targetHighPrice),
    targetLowPrice: unwrapYahooNumber(financialData.targetLowPrice),
    // Each entry in Yahoo's recommendationTrend.trend already IS a
    // {period, strongBuy, buy, hold, sell, strongSell} bucket for a given
    // month (0m = current). We only need the current month for a "right
    // now" consensus breakdown.
    currentTrend,
    upgradeHistory
  };
}

// Forward-looking dividend AND earnings-date metrics for a US stock: yield,
// payout ratio, next ex-dividend/payment date, and next earnings date +
// consensus EPS/revenue estimate. These come from Yahoo's calendarEvents
// module (alongside summaryDetail) in a single response - earnings fields
// are included here rather than in a separate fetch specifically to avoid
// a second quoteSummary call (and a second slot on the shared rate-limited
// queue, see scheduleOnQuoteSummaryQueue) for data Yahoo already returns
// together. Same quoteSummary endpoint/auth as fetchYahooAssetProfile
// above, different modules.
//
// dividendYield comes back from Yahoo as a fraction (0.0236, not 2.36) -
// converted to a percent here so the UI doesn't have to remember which of
// Yahoo's several "yield" fields is a fraction vs. already a percent (they
// aren't consistent - fiveYearAvgDividendYield, deliberately not used here,
// already comes back as a percent number).
async function fetchYahooDividendSummary(symbol) {
  const quoteSummary = await fetchYahooQuoteSummary(symbol, 'summaryDetail,calendarEvents');
  const summaryDetail = quoteSummary?.summaryDetail || {};
  const calendarEvents = quoteSummary?.calendarEvents || {};
  const earnings = calendarEvents.earnings || {};
  const yieldFraction = unwrapYahooNumber(summaryDetail.dividendYield);

  // earningsDate is an array - Yahoo sometimes gives a 1- or 2-date
  // estimated range for the upcoming report; the first entry is the
  // primary estimate.
  const earningsDateRaw = Array.isArray(earnings.earningsDate) ? earnings.earningsDate[0] : null;

  return {
    dividendRate: unwrapYahooNumber(summaryDetail.dividendRate),
    dividendYieldPercent: yieldFraction === null ? null : yieldFraction * 100,
    payoutRatio: unwrapYahooNumber(summaryDetail.payoutRatio),
    exDividendDateEpoch:
      unwrapYahooNumber(summaryDetail.exDividendDate) ?? unwrapYahooNumber(calendarEvents.exDividendDate),
    nextDividendDateEpoch: unwrapYahooNumber(calendarEvents.dividendDate),
    earningsDateEpoch: unwrapYahooNumber(earningsDateRaw),
    isEarningsDateEstimate: typeof earnings.isEarningsDateEstimate === 'boolean' ? earnings.isEarningsDateEstimate : null,
    epsEstimateAverage: unwrapYahooNumber(earnings.earningsAverage),
    revenueEstimateAverage: unwrapYahooNumber(earnings.revenueAverage)
  };
}

// Actual historical dividend payments (date + $/share) for a US stock, via
// the same public chart endpoint as fetchYahooHistoricalCloses (events=div)
// — no crumb/cookie needed, unlike fetchYahooDividendSummary above. Used to
// compute "total dividends received" against a holding's actual purchase
// history, not just a forward-looking yield estimate.
async function fetchYahooDividendHistory(symbol, fromDateStr) {
  const encoded = encodeURIComponent(symbol);
  const period1 = fromDateStr
    ? Math.floor(new Date(`${fromDateStr}T00:00:00Z`).getTime() / 1000)
    : Math.floor(Date.now() / 1000) - 5 * 365 * 24 * 60 * 60; // 5y default: dividends pay quarterly, so a
  // short lookback (like fetchYahooHistoricalCloses's ~400 days) would miss
  // most of a long-held position's payment history.
  const period2 = Math.floor(Date.now() / 1000);

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}`;
  const response = await axios.get(yahooUrl, {
    params: { period1, period2, interval: '1d', events: 'div' },
    timeout: 15000,
    headers: YAHOO_HEADERS
  });

  const dividends = response?.data?.chart?.result?.[0]?.events?.dividends;
  if (!dividends || typeof dividends !== 'object') return [];

  return Object.values(dividends)
    .map((d) => ({
      date: new Date(d.date * 1000).toISOString().slice(0, 10),
      amountPerShare: Number(d.amount)
    }))
    .filter((d) => Number.isFinite(d.amountPerShare))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// "Similar Companies" (SimplyWall.st's peer-comparison feature) via a
// public Yahoo endpoint - confirmed during development to need no
// crumb/cookie at all, same "no auth" family as fetchYahooHistoricalCloses.
// Distinct from fetchYahooAssetProfile's sector/industry (same *category*
// idea, different mechanism) - this is Yahoo's own similarity scoring, not
// something derived from sector matching.
async function fetchYahooSimilarCompanies(symbol) {
  const encoded = encodeURIComponent(symbol);
  const response = await axios.get(`https://query1.finance.yahoo.com/v6/finance/recommendationsbysymbol/${encoded}`, {
    timeout: 15000,
    headers: YAHOO_HEADERS
  });

  const recommended = response?.data?.finance?.result?.[0]?.recommendedSymbols;
  if (!Array.isArray(recommended)) return [];
  return recommended
    .map((r) => ({ symbol: r.symbol || null, score: unwrapYahooNumber(r.score) }))
    .filter((r) => r.symbol);
}

// Trailing P/E for a batch of peer symbols (the "PE vs. similar companies"
// chart) - a single v7/finance/quote call for all of them at once, verified
// during development against a real multi-symbol request. Same crumb/cookie
// auth family as quoteSummary, so routed through the same
// fetchYahooWithCrumbRetry queue for consistent retry/backoff behavior.
// Called with fetchYahooSimilarCompanies's own results, not independently -
// there's no "similar companies" concept without it.
async function fetchYahooPeerQuotes(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) return [];
  const url = 'https://query1.finance.yahoo.com/v7/finance/quote';
  const response = await fetchYahooWithCrumbRetry(url, { symbols: symbols.join(',') });

  const rows = response?.data?.quoteResponse?.result;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({ symbol: r.symbol || null, trailingPE: unwrapYahooNumber(r.trailingPE) }))
    .filter((r) => r.symbol);
}

// Fundamentals for the stock research/"Snowflake" scorecard (see
// src/utils/stockScorecard.js), for a single searched-up symbol - not
// batched across a whole portfolio like the other fetchYahoo* functions,
// so this can afford several combined requests (quoteSummary +
// fundamentals-timeseries + recommendationsbysymbol) without worrying
// about the shared rate-limited queue the way a portfolio-wide batch
// would need to.
//
// balanceSheetHistory and incomeStatementHistory (quoteSummary modules)
// were deliberately left OUT of the modules list below - verified during
// development that Yahoo returns those modules' statement shells (dates
// only) with nearly every actual line item empty/zero for real tickers.
// financialData's pre-computed ratios (currentRatio, debtToEquity,
// returnOnEquity, operatingCashflow, totalDebt, earningsGrowth,
// revenueGrowth) cover current-year Financial Health reliably instead;
// fundamentalsHistory (fetchYahooFundamentalsTimeseries, a different
// endpoint entirely) covers the multi-year trend checks (Past
// Performance) that balanceSheetHistory/incomeStatementHistory would
// have, had they actually worked.
async function fetchYahooStockResearch(symbol) {
  const threeYearsAgo = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [quoteSummary, fundamentalsHistory, similarCompanies, priceHistory] = await Promise.all([
    fetchYahooQuoteSummary(
      symbol,
      'summaryDetail,defaultKeyStatistics,financialData,earningsTrend,insiderHolders,institutionOwnership,assetProfile,insiderTransactions'
    ),
    // A failure here shouldn't sink the whole research response - the
    // scorecard's Past Performance category just comes back empty
    // (null checks, not faked), same "degrade one category, not the
    // page" principle as everywhere else in this project.
    fetchYahooFundamentalsTimeseries(symbol).catch((err) => {
      console.warn('[stock-research] fundamentals-timeseries fetch failed', { symbol, error: err && err.message });
      return {};
    }),
    fetchYahooSimilarCompanies(symbol).catch((err) => {
      console.warn('[stock-research] similar-companies fetch failed', { symbol, error: err && err.message });
      return [];
    }),
    // Public endpoint, no crumb needed - same as fetchYahooHistoricalCloses's
    // other callers. ~3y back gives the Price History chart a meaningful
    // range without an unbounded lookback.
    fetchYahooHistoricalCloses(symbol, threeYearsAgo).catch((err) => {
      console.warn('[stock-research] price-history fetch failed', { symbol, error: err && err.message });
      return [];
    })
  ]);

  // Depends on similarCompanies's own symbols, so it can't join the
  // Promise.all above - fetched right after, same graceful-degradation
  // pattern as everything else here.
  const peerSymbols = similarCompanies.map((c) => c.symbol).filter(Boolean);
  const peerQuotes = await fetchYahooPeerQuotes(peerSymbols).catch((err) => {
    console.warn('[stock-research] peer-quotes fetch failed', { symbol, error: err && err.message });
    return [];
  });

  const summaryDetail = quoteSummary?.summaryDetail || {};
  const defaultKeyStatistics = quoteSummary?.defaultKeyStatistics || {};
  const financialData = quoteSummary?.financialData || {};
  const assetProfile = quoteSummary?.assetProfile || {};
  const nextYearTrend = (quoteSummary?.earningsTrend?.trend || []).find((t) => t.period === '+1y');
  const insiderHolders = Array.isArray(quoteSummary?.insiderHolders?.holders)
    ? quoteSummary.insiderHolders.holders
    : [];
  const institutionOwnership = Array.isArray(quoteSummary?.institutionOwnership?.ownershipList)
    ? quoteSummary.institutionOwnership.ownershipList
    : [];
  // Detailed per-transaction insider trading log (distinct from
  // insiderHolders above, which is each holder's own latest transaction
  // only) - verified during development to return real filer names,
  // relations, $ values and dates for real tickers.
  const insiderTransactionsRaw = Array.isArray(quoteSummary?.insiderTransactions?.transactions)
    ? quoteSummary.insiderTransactions.transactions
    : [];
  const insiderTransactions = insiderTransactionsRaw
    .map((t) => ({
      filerName: t.filerName || null,
      filerRelation: t.filerRelation || null,
      transactionText: t.transactionText || null,
      shares: unwrapYahooNumber(t.shares),
      value: unwrapYahooNumber(t.value),
      startDateEpoch: unwrapYahooNumber(t.startDate)
    }))
    .filter((t) => t.startDateEpoch !== null)
    .sort((a, b) => b.startDateEpoch - a.startDateEpoch)
    .slice(0, 10);
  // Yahoo's real officer names sometimes have doubled internal whitespace
  // (e.g. "Mr. Kevan  Parekh", confirmed against a real AAPL response) -
  // collapsed here rather than displayed as-is.
  const companyOfficers = Array.isArray(assetProfile.companyOfficers)
    ? assetProfile.companyOfficers.map((o) => ({
        name: o.name ? o.name.replace(/\s+/g, ' ').trim() : null,
        title: o.title || null,
        age: unwrapYahooNumber(o.age),
        totalPay: unwrapYahooNumber(o.totalPay)
      }))
    : [];

  return {
    // Value
    trailingPE: unwrapYahooNumber(summaryDetail.trailingPE),
    forwardPE: unwrapYahooNumber(summaryDetail.forwardPE),
    pegRatio: unwrapYahooNumber(defaultKeyStatistics.pegRatio),
    priceToBook: unwrapYahooNumber(defaultKeyStatistics.priceToBook),
    // Future growth
    earningsGrowth: unwrapYahooNumber(financialData.earningsGrowth),
    revenueGrowth: unwrapYahooNumber(financialData.revenueGrowth),
    nextYearEarningsGrowth: unwrapYahooNumber(nextYearTrend?.growth),
    targetMeanPrice: unwrapYahooNumber(financialData.targetMeanPrice),
    currentPrice: unwrapYahooNumber(financialData.currentPrice),
    // Always consistent with currentPrice's own currency/scale (it's
    // literally price × shares from the same live quote) - see
    // dcfValuation.js's use of it to derive a shares-outstanding figure
    // that can't drift out of sync with currentPrice the way the
    // separately-reported defaultKeyStatistics.sharesOutstanding can.
    marketCap: unwrapYahooNumber(summaryDetail.marketCap),
    // Financial health
    currentRatio: unwrapYahooNumber(financialData.currentRatio),
    debtToEquity: unwrapYahooNumber(financialData.debtToEquity),
    returnOnEquity: unwrapYahooNumber(financialData.returnOnEquity),
    returnOnAssets: unwrapYahooNumber(financialData.returnOnAssets),
    operatingCashflow: unwrapYahooNumber(financialData.operatingCashflow),
    totalDebt: unwrapYahooNumber(financialData.totalDebt),
    // DCF inputs (see src/utils/dcfValuation.js) - beta drives the CAPM
    // discount rate, sharesOutstanding converts a total equity value into
    // a per-share fair value.
    beta: unwrapYahooNumber(defaultKeyStatistics.beta),
    sharesOutstanding: unwrapYahooNumber(defaultKeyStatistics.sharesOutstanding),
    // Ownership
    heldPercentInsiders: unwrapYahooNumber(defaultKeyStatistics.heldPercentInsiders),
    heldPercentInstitutions: unwrapYahooNumber(defaultKeyStatistics.heldPercentInstitutions),
    // Each holder's own latest transaction, not a full transaction log -
    // a rough "are insiders net buying or selling" signal, same spirit as
    // (not the same data source as) SimplyWall.st's insider trading check.
    insiderRecentSales: insiderHolders.filter((h) => /sale/i.test(h.transactionDescription || '')).length,
    insiderRecentPurchases: insiderHolders.filter((h) => /purchase/i.test(h.transactionDescription || '')).length,
    topInstitutionalHolders: institutionOwnership.slice(0, 5).map((h) => ({
      organization: h.organization || null,
      pctHeld: unwrapYahooNumber(h.pctHeld)
    })),
    // Detailed per-transaction insider trading log - see insiderTransactions
    // extraction above.
    insiderTransactions,
    // Real multi-year statement history - see FUNDAMENTALS_TIMESERIES_TYPES
    // for exactly which line items, and stockScorecard.js's
    // computePastPerformanceChecks for how they become checks.
    fundamentalsHistory,
    // ~3y of daily closes for the Price History chart - see
    // fetchYahooHistoricalCloses above.
    priceHistory,
    // Peer trailing P/E for the "PE vs. similar companies" chart - matched
    // against similarCompanies by symbol in the frontend (this app doesn't
    // have an industry-wide P/E distribution to compare against instead).
    peerQuotes,
    // Company info + management roster - display-only, not part of the
    // scorecard: SimplyWall.st itself keeps "Management" out of its
    // Snowflake score too (no peer-benchmark data available for CEO comp
    // or tenure via this API, only the current officer roster).
    companyProfile: {
      sector: assetProfile.sector || null,
      industry: assetProfile.industry || null,
      website: assetProfile.website || null,
      longBusinessSummary: assetProfile.longBusinessSummary || null,
      fullTimeEmployees: unwrapYahooNumber(assetProfile.fullTimeEmployees),
      city: assetProfile.city || null,
      country: assetProfile.country || null,
      companyOfficers
    },
    // Yahoo's own similarity scoring (not derived from our sector data) -
    // see fetchYahooSimilarCompanies above.
    similarCompanies
  };
}

module.exports = {
  getYahooPayload,
  fetchYahooHistoricalCloses,
  fetchYahooHistoricalRateForDate,
  fetchYahooNews,
  fetchYahooSymbolSearch,
  fetchYahooAssetProfile,
  fetchYahooAnalystData,
  fetchYahooDividendSummary,
  fetchYahooDividendHistory,
  fetchYahooStockResearch,
  fetchYahooFundamentalsTimeseries,
  fetchYahooSimilarCompanies,
  fetchYahooPeerQuotes,
  unwrapYahooNumber
};
