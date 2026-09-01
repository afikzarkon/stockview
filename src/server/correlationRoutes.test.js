/**
 * @jest-environment node
 */
jest.mock('./yahooQuotes', () => ({
  fetchYahooHistoricalCloses: jest.fn()
}));

const http = require('http');
const express = require('express');
const { mountCorrelationRoutes } = require('./correlationRoutes');
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

describe('correlationRoutes', () => {
  let app;
  let server;
  let baseUrl;

  beforeAll((done) => {
    app = express();
    app.use(express.json());
    mountCorrelationRoutes(app);
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    yahooQuotes.fetchYahooHistoricalCloses.mockReset();
  });

  test('POST /api/stock-price-history returns {} for an empty symbol list', async () => {
    const res = await post(`${baseUrl}/api/stock-price-history`, { symbols: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ history: {} });
    expect(yahooQuotes.fetchYahooHistoricalCloses).not.toHaveBeenCalled();
  });

  test('POST /api/stock-price-history batches, dedupes and uppercases symbols', async () => {
    yahooQuotes.fetchYahooHistoricalCloses.mockImplementation(async (symbol) => [
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 101 }
    ]);

    const res = await post(`${baseUrl}/api/stock-price-history`, { symbols: ['aapl', 'AAPL', ' msft '] });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.history).sort()).toEqual(['AAPL', 'MSFT']);
    expect(res.body.history.AAPL).toEqual([
      { date: '2024-01-01', close: 100 },
      { date: '2024-01-02', close: 101 }
    ]);
    // deduped: 'aapl' and 'AAPL' collapse into a single upstream call
    expect(yahooQuotes.fetchYahooHistoricalCloses).toHaveBeenCalledTimes(2);
  });

  test('POST /api/stock-price-history returns an empty array (not an error) for a symbol whose fetch fails', async () => {
    // Distinct symbols from the earlier test - the module-level cache
    // persists across tests in this file, and reusing AAPL here would read
    // back that test's cached value instead of exercising this mock.
    yahooQuotes.fetchYahooHistoricalCloses.mockImplementation(async (symbol) => {
      if (symbol === 'BADTICKER') throw new Error('not found');
      return [{ date: '2024-01-01', close: 50 }];
    });

    const res = await post(`${baseUrl}/api/stock-price-history`, { symbols: ['GOODTICKER', 'BADTICKER'] });
    expect(res.status).toBe(200);
    expect(res.body.history.GOODTICKER).toEqual([{ date: '2024-01-01', close: 50 }]);
    expect(res.body.history.BADTICKER).toEqual([]);
  });

  test('POST /api/stock-price-history caches per symbol so a repeat request does not re-fetch', async () => {
    yahooQuotes.fetchYahooHistoricalCloses.mockResolvedValue([{ date: '2024-01-01', close: 10 }]);

    await post(`${baseUrl}/api/stock-price-history`, { symbols: ['NVDA'] });
    await post(`${baseUrl}/api/stock-price-history`, { symbols: ['NVDA'] });

    expect(yahooQuotes.fetchYahooHistoricalCloses).toHaveBeenCalledTimes(1);
  });

  test('POST /api/stock-price-history passes a valid "from" date through, but ignores an invalid one', async () => {
    yahooQuotes.fetchYahooHistoricalCloses.mockResolvedValue([]);

    await post(`${baseUrl}/api/stock-price-history`, { symbols: ['GOOG'], from: '2023-05-01' });
    expect(yahooQuotes.fetchYahooHistoricalCloses).toHaveBeenLastCalledWith('GOOG', '2023-05-01');

    await post(`${baseUrl}/api/stock-price-history`, { symbols: ['GOOGL'], from: 'not-a-date' });
    expect(yahooQuotes.fetchYahooHistoricalCloses).toHaveBeenLastCalledWith('GOOGL', undefined);
  });

  test('POST /api/stock-price-history caps the batch at 30 symbols', async () => {
    yahooQuotes.fetchYahooHistoricalCloses.mockResolvedValue([]);
    const symbols = Array.from({ length: 40 }, (_, i) => `SYM${i}`);

    const res = await post(`${baseUrl}/api/stock-price-history`, { symbols });
    expect(Object.keys(res.body.history)).toHaveLength(30);
  });
});
