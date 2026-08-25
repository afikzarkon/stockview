/**
 * @jest-environment node
 */
// taseScraper.js pulls in cheerio/puppeteer, which (via undici) need Web
// Streams globals Jest doesn't provide by default. Since these tests are
// about route wiring and error handling, not the scraper internals
// (which were verified manually against a live sandbox — see the
// project's refactor notes), we mock taseScraper entirely rather than
// fight the dependency chain.
jest.mock('./taseScraper', () => ({
  readCachedTaseQuote: jest.fn(),
  readStaleTaseQuote: jest.fn(),
  writeCachedTaseQuote: jest.fn(),
  isUsableTasePayload: jest.fn(),
  scrapeTaseWithPuppeteer: jest.fn(),
  scrapeTaseFallbackWithAxios: jest.fn()
}));
jest.mock('./yahooQuotes', () => ({
  getYahooPayload: jest.fn()
}));

const http = require('http');
const express = require('express');
const { mountQuotesRoutes } = require('./quotesRoutes');
const taseScraper = require('./taseScraper');
const yahooQuotes = require('./yahooQuotes');

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
    taseScraper.scrapeTaseWithPuppeteer.mockRejectedValue(new Error('puppeteer unavailable in test'));
    taseScraper.scrapeTaseFallbackWithAxios.mockRejectedValue(new Error('network unavailable in test'));
    yahooQuotes.getYahooPayload.mockRejectedValue(new Error('network unavailable in test'));
  });

  test('GET /api/israeli-stock/:id rejects a non-numeric id with 400', async () => {
    const res = await get(`${baseUrl}/api/israeli-stock/not-a-number`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid stock id');
  });

  test('GET /api/israeli-stock/:id tries puppeteer then the axios fallback, and degrades gracefully when both fail', async () => {
    const res = await get(`${baseUrl}/api/israeli-stock/1234`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentPrice: null, changePercent: null });
    expect(taseScraper.scrapeTaseWithPuppeteer).toHaveBeenCalled();
    expect(taseScraper.scrapeTaseFallbackWithAxios).toHaveBeenCalled();
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
    expect(taseScraper.scrapeTaseWithPuppeteer).not.toHaveBeenCalled();
  });

  test('GET /api/israeli-stock/:id succeeds via puppeteer without needing the fallback', async () => {
    taseScraper.scrapeTaseWithPuppeteer.mockResolvedValue({ currentPrice: 5000, changePercent: 2.3 });
    const res = await get(`${baseUrl}/api/israeli-stock/1111`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ currentPrice: 5000, changePercent: 2.3 });
    expect(taseScraper.scrapeTaseFallbackWithAxios).not.toHaveBeenCalled();
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
});
