/**
 * @jest-environment node
 */
// taseScraper.js pulls in puppeteer, which (via undici) needs Web Streams
// globals Jest doesn't provide by default. Since these tests are about
// route wiring and the order of the quote source chain, not any one
// source's internals (each has its own test file), every source module is
// mocked rather than fighting the dependency chain.
jest.mock('./taseScraper', () => ({
  readCachedTaseQuote: jest.fn(),
  readStaleTaseQuote: jest.fn(),
  writeCachedTaseQuote: jest.fn(),
  isUsableTasePayload: jest.fn(),
  scrapeTaseQuote: jest.fn()
}));
jest.mock('./taseQuoteApi', () => ({
  fetchTaseQuoteFromApi: jest.fn()
}));
jest.mock('./taseHistoryApi', () => ({
  fetchTaseQuoteFromEod: jest.fn()
}));
jest.mock('./yahooQuotes', () => ({
  getYahooPayload: jest.fn(),
  fetchYahooHistoricalRateForDate: jest.fn()
}));
jest.mock('./bizportalSearch', () => ({
  searchIsraeliSecuritiesByName: jest.fn()
}));

const http = require('http');
const express = require('express');
const { mountQuotesRoutes } = require('./quotesRoutes');
const taseScraper = require('./taseScraper');
const taseQuoteApi = require('./taseQuoteApi');
const taseHistoryApi = require('./taseHistoryApi');
const yahooQuotes = require('./yahooQuotes');
const bizportalSearch = require('./bizportalSearch');

// Jest's node test environment doesn't expose global fetch, so use Node's
// built-in http module for these requests instead of adding a dependency.
function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { agent: false }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let body = null;
        try {
          body = JSON.parse(data);
        } catch {
          body = null;
        }
        resolve({ status: res.statusCode, body });
      });
    }).on('error', reject);
  });
}

describe('quotesRoutes', () => {
  let app;
  let server;
  let baseUrl;

  beforeAll((done) => {
    app = express();
    mountQuotesRoutes(app);
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  // CRA's default Jest config sets resetMocks: true, which wipes mock
  // implementations before every test (including the ones from jest.mock()
  // factories). Re-establish the "everything fails, nothing is cached"
  // baseline before each test so each test only has to override what it
  // specifically cares about.
  beforeEach(() => {
    taseScraper.readCachedTaseQuote.mockReturnValue(null);
    taseScraper.readStaleTaseQuote.mockReturnValue(null);
    taseScraper.writeCachedTaseQuote.mockReturnValue(undefined);
    taseScraper.isUsableTasePayload.mockImplementation(
      (p) => p && typeof p.currentPrice === 'number' && typeof p.changePercent === 'number'
    );
    taseQuoteApi.fetchTaseQuoteFromApi.mockRejectedValue(new Error('network unavailable in test'));
    taseHistoryApi.fetchTaseQuoteFromEod.mockRejectedValue(new Error('network unavailable in test'));
    taseScraper.scrapeTaseQuote.mockRejectedValue(new Error('puppeteer unavailable in test'));
    yahooQuotes.getYahooPayload.mockRejectedValue(new Error('network unavailable in test'));
    yahooQuotes.fetchYahooHistoricalRateForDate.mockRejectedValue(new Error('network unavailable in test'));
    bizportalSearch.searchIsraeliSecuritiesByName.mockRejectedValue(new Error('network unavailable in test'));
  });

  test('GET /api/israeli-stock/:id rejects a non-numeric id with 400', async () => {
    const res = await get(`${baseUrl}/api/israeli-stock/not-a-number`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid stock id');
  });

  test('GET /api/israeli-stock/:id tries all three sources, and degrades gracefully when every one fails', async () => {
    const res = await get(`${baseUrl}/api/israeli-stock/1234`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentPrice: null, changePercent: null });
    expect(taseQuoteApi.fetchTaseQuoteFromApi).toHaveBeenCalled();
    expect(taseHistoryApi.fetchTaseQuoteFromEod).toHaveBeenCalled();
    expect(taseScraper.scrapeTaseQuote).toHaveBeenCalled();
  });

  // Every source is addressed by security id alone - the scraper builds its
  // own page URL. A source accidentally receiving something else (the URL
  // the route used to construct, say) would request the wrong security.
  test('GET /api/israeli-stock/:id passes the security id to each source', async () => {
    await get(`${baseUrl}/api/israeli-stock/629014`);
    expect(taseQuoteApi.fetchTaseQuoteFromApi).toHaveBeenCalledWith('629014');
    expect(taseHistoryApi.fetchTaseQuoteFromEod).toHaveBeenCalledWith('629014');
    expect(taseScraper.scrapeTaseQuote).toHaveBeenCalledWith('629014');
  });

  test('GET /api/israeli-stock/:id serves a stale cached quote if scraping fails but a stale value exists', async () => {
    taseScraper.readStaleTaseQuote.mockReturnValue({ currentPrice: 3500, changePercent: 1.1 });
    const res = await get(`${baseUrl}/api/israeli-stock/5678`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentPrice: 3500, changePercent: 1.1 });
  });

  test('GET /api/israeli-stock/:id returns a cached quote immediately without calling the scraper', async () => {
    taseScraper.readCachedTaseQuote.mockReturnValue({ currentPrice: 4000, changePercent: 0.5 });
    const res = await get(`${baseUrl}/api/israeli-stock/9999`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentPrice: 4000, changePercent: 0.5 });
    expect(taseQuoteApi.fetchTaseQuoteFromApi).not.toHaveBeenCalled();
  });

  // The whole point of the reordering: the cheap JSON API answers first and
  // the headless browser is never launched. Puppeteer on the hot path (the
  // client polls every 10s) was both the slow and the failure-prone part.
  test('GET /api/israeli-stock/:id succeeds via the TASE API without touching the later sources', async () => {
    taseQuoteApi.fetchTaseQuoteFromApi.mockResolvedValue({ currentPrice: 11960, changePercent: 1.36 });
    const res = await get(`${baseUrl}/api/israeli-stock/629014`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentPrice: 11960, changePercent: 1.36 });
    expect(taseHistoryApi.fetchTaseQuoteFromEod).not.toHaveBeenCalled();
    expect(taseScraper.scrapeTaseQuote).not.toHaveBeenCalled();
  });

  // The API entry deliberately has no retryOnce - the chain itself is the
  // retry, with a different source, rather than hitting a failing endpoint
  // twice in a row.
  test('GET /api/israeli-stock/:id does not retry the TASE API, it moves straight to the EOD source', async () => {
    taseHistoryApi.fetchTaseQuoteFromEod.mockResolvedValue({ currentPrice: 7811, changePercent: -1.72 });
    const res = await get(`${baseUrl}/api/israeli-stock/604611`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentPrice: 7811, changePercent: -1.72 });
    expect(taseQuoteApi.fetchTaseQuoteFromApi).toHaveBeenCalledTimes(1);
    expect(taseScraper.scrapeTaseQuote).not.toHaveBeenCalled();
  });

  // A source that resolves with nulls (e.g. the TASE API's HTTP-200-with-a-
  // null-body answer for an unknown id) must be treated as a failure and
  // fall through, not returned as if it were a real quote.
  test('GET /api/israeli-stock/:id falls through a source that resolves with an unusable null payload', async () => {
    taseQuoteApi.fetchTaseQuoteFromApi.mockResolvedValue({ currentPrice: null, changePercent: null });
    taseHistoryApi.fetchTaseQuoteFromEod.mockResolvedValue({ currentPrice: 6000, changePercent: 1.1 });
    const res = await get(`${baseUrl}/api/israeli-stock/1111`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentPrice: 6000, changePercent: 1.1 });
  });

  test('GET /api/israeli-stock/:id reaches the scraper only after both APIs fail', async () => {
    taseScraper.scrapeTaseQuote.mockResolvedValue({ currentPrice: 5000, changePercent: 2.3 });
    const res = await get(`${baseUrl}/api/israeli-stock/1111`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentPrice: 5000, changePercent: 2.3 });
    expect(taseQuoteApi.fetchTaseQuoteFromApi).toHaveBeenCalled();
    expect(taseHistoryApi.fetchTaseQuoteFromEod).toHaveBeenCalled();
  });

  test('GET /api/israeli-stock/:id still retries the scraper once on a transient failure', async () => {
    taseScraper.scrapeTaseQuote
      .mockRejectedValueOnce(new Error('transient timeout'))
      .mockResolvedValueOnce({ currentPrice: 5000, changePercent: 2.3 });
    const res = await get(`${baseUrl}/api/israeli-stock/1111`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentPrice: 5000, changePercent: 2.3 });
    expect(taseScraper.scrapeTaseQuote).toHaveBeenCalledTimes(2);
  });

  test('GET /api/american-stock/:symbol rejects a blank symbol with 400', async () => {
    const res = await get(`${baseUrl}/api/american-stock/${encodeURIComponent(' ')}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid symbol');
  });

  test('GET /api/american-stock/:symbol degrades gracefully to nulls when Yahoo fails', async () => {
    const res = await get(`${baseUrl}/api/american-stock/AAPL`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentPrice: null, changePercent: 0 });
  });

  test('GET /api/american-stock/:symbol returns real data when Yahoo succeeds', async () => {
    yahooQuotes.getYahooPayload.mockResolvedValue({ currentPrice: 190.5, changePercent: 0.8 });
    const res = await get(`${baseUrl}/api/american-stock/AAPL`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentPrice: 190.5, changePercent: 0.8 });
  });

  test('GET /api/exchange-rate degrades gracefully to a null rate when Yahoo fails', async () => {
    const res = await get(`${baseUrl}/api/exchange-rate`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rate: null });
  });

  test('GET /api/exchange-rate returns the real rate when Yahoo succeeds', async () => {
    yahooQuotes.getYahooPayload.mockResolvedValue({ currentPrice: 3.71, changePercent: -0.1 });
    const res = await get(`${baseUrl}/api/exchange-rate`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rate: 3.71 });
  });

  test('GET /api/exchange-rate/:date rejects a non-YYYY-MM-DD date with 400', async () => {
    const res = await get(`${baseUrl}/api/exchange-rate/not-a-date`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  test('GET /api/exchange-rate/:date degrades gracefully to a null rate/date when Yahoo fails', async () => {
    const res = await get(`${baseUrl}/api/exchange-rate/2023-06-15`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rate: null, date: null });
  });

  test('GET /api/exchange-rate/:date returns the real historical rate (and the actual trading day used) when Yahoo succeeds', async () => {
    yahooQuotes.fetchYahooHistoricalRateForDate.mockResolvedValue({ date: '2023-06-14', rate: 3.65 });
    const res = await get(`${baseUrl}/api/exchange-rate/2023-06-15`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rate: 3.65, date: '2023-06-14' });
    expect(yahooQuotes.fetchYahooHistoricalRateForDate).toHaveBeenCalledWith('USDILS=X', '2023-06-15');
  });

  test('GET /api/exchange-rate/:date returns a null rate/date when no trading day is found on or before the requested date', async () => {
    yahooQuotes.fetchYahooHistoricalRateForDate.mockResolvedValue(null);
    const res = await get(`${baseUrl}/api/exchange-rate/2023-06-15`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rate: null, date: null });
  });

  test('GET /api/israeli-stock-search returns an empty result list without calling the search module for a blank query', async () => {
    const res = await get(`${baseUrl}/api/israeli-stock-search?q=`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [] });
    expect(bizportalSearch.searchIsraeliSecuritiesByName).not.toHaveBeenCalled();
  });

  test('GET /api/israeli-stock-search degrades gracefully to an empty result list when the search module fails', async () => {
    const res = await get(`${baseUrl}/api/israeli-stock-search?q=${encodeURIComponent('טבע')}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [] });
  });

  test('GET /api/israeli-stock-search returns the resolved securities on success', async () => {
    bizportalSearch.searchIsraeliSecuritiesByName.mockResolvedValue([
      { securityId: '629014', officialName: 'טבע', symbol: 'TEVA' }
    ]);
    const res = await get(`${baseUrl}/api/israeli-stock-search?q=${encodeURIComponent('טבע')}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ results: [{ securityId: '629014', officialName: 'טבע', symbol: 'TEVA' }] });
    expect(bizportalSearch.searchIsraeliSecuritiesByName).toHaveBeenCalledWith('טבע');
  });
});
