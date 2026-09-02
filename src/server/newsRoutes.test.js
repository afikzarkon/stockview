/**
 * @jest-environment node
 */
jest.mock('./yahooQuotes', () => ({
  fetchYahooNews: jest.fn()
}));

const http = require('http');
const express = require('express');
const { mountNewsRoutes } = require('./newsRoutes');
const yahooQuotes = require('./yahooQuotes');

// Jest's node test environment doesn't expose global fetch, so use Node's
// built-in http module for these requests instead of adding a dependency.
function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body || {});
    const req = http.request(
      url,
      {
        method: 'POST',
        agent: false,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let parsedBody = null;
          try {
            parsedBody = JSON.parse(raw);
          } catch {
            parsedBody = null;
          }
          resolve({ status: res.statusCode, body: parsedBody });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

describe('newsRoutes', () => {
  let app;
  let server;
  let baseUrl;

  beforeAll((done) => {
    app = express();
    app.use(express.json());
    mountNewsRoutes(app);
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    yahooQuotes.fetchYahooNews.mockReset();
  });

  test('POST /api/stock-news returns {} for an empty symbol list', async () => {
    const res = await post(`${baseUrl}/api/stock-news`, { symbols: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ news: {} });
    expect(yahooQuotes.fetchYahooNews).not.toHaveBeenCalled();
  });

  test('POST /api/stock-news batches, dedupes and uppercases symbols', async () => {
    yahooQuotes.fetchYahooNews.mockResolvedValue([
      { uuid: '1', title: 'A story', publisher: 'X', link: 'https://x', publishedAtEpoch: 1700000000, relatedTickers: [] }
    ]);

    const res = await post(`${baseUrl}/api/stock-news`, { symbols: ['aapl', 'AAPL', ' msft '] });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.news).sort()).toEqual(['AAPL', 'MSFT']);
    expect(yahooQuotes.fetchYahooNews).toHaveBeenCalledTimes(2);
    expect(yahooQuotes.fetchYahooNews).toHaveBeenCalledWith('AAPL', 10);
  });

  test('POST /api/stock-news returns an empty array (not an error) for a symbol whose fetch fails', async () => {
    yahooQuotes.fetchYahooNews.mockImplementation(async (symbol) => {
      if (symbol === 'BADTICKER') throw new Error('not found');
      return [{ uuid: '1', title: 'ok', publisher: 'X', link: 'https://x', publishedAtEpoch: 1, relatedTickers: [] }];
    });

    const res = await post(`${baseUrl}/api/stock-news`, { symbols: ['GOODTICKER', 'BADTICKER'] });
    expect(res.status).toBe(200);
    expect(res.body.news.GOODTICKER).toHaveLength(1);
    expect(res.body.news.BADTICKER).toEqual([]);
  });

  test('POST /api/stock-news caches per symbol so a repeat request does not re-fetch', async () => {
    yahooQuotes.fetchYahooNews.mockResolvedValue([]);

    await post(`${baseUrl}/api/stock-news`, { symbols: ['NVDA'] });
    await post(`${baseUrl}/api/stock-news`, { symbols: ['NVDA'] });

    expect(yahooQuotes.fetchYahooNews).toHaveBeenCalledTimes(1);
  });

  test('POST /api/stock-news caps the batch at 30 symbols', async () => {
    yahooQuotes.fetchYahooNews.mockResolvedValue([]);
    const symbols = Array.from({ length: 40 }, (_, i) => `SYM${i}`);

    const res = await post(`${baseUrl}/api/stock-news`, { symbols });
    expect(Object.keys(res.body.news)).toHaveLength(30);
  });
});
