/**
 * @jest-environment node
 */
jest.mock('./taseHistoryApi', () => ({
  fetchTaseHistoricalCloses: jest.fn()
}));
jest.mock('./yahooQuotes', () => ({
  fetchYahooHistoricalCloses: jest.fn()
}));

const http = require('http');
const express = require('express');
const { mountHistoricalPricesRoutes } = require('./historicalPricesRoutes');
const taseHistoryApi = require('./taseHistoryApi');
const yahooQuotes = require('./yahooQuotes');

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

describe('historicalPricesRoutes', () => {
  let app;
  let server;
  let baseUrl;

  beforeAll((done) => {
    app = express();
    app.use(express.json());
    mountHistoricalPricesRoutes(app);
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    taseHistoryApi.fetchTaseHistoricalCloses.mockReset();
    yahooQuotes.fetchYahooHistoricalCloses.mockReset();
  });

  test('POST /api/israeli-stocks-history returns {} for an empty symbol list without calling the fetcher', async () => {
    const res = await post(`${baseUrl}/api/israeli-stocks-history`, { symbols: [] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ history: {} });
    expect(taseHistoryApi.fetchTaseHistoricalCloses).not.toHaveBeenCalled();
  });

  test('POST /api/israeli-stocks-history returns each symbol\'s history keyed by the symbol as given', async () => {
    taseHistoryApi.fetchTaseHistoricalCloses.mockImplementation(async (symbol) => [
      { date: '2024-01-01', close: symbol === '629014' ? 10000 : 20000 }
    ]);
    const res = await post(`${baseUrl}/api/israeli-stocks-history`, { symbols: ['629014', '662577'], from: '2024-01-01' });
    expect(res.status).toBe(200);
    expect(res.body.history['629014']).toEqual([{ date: '2024-01-01', close: 10000 }]);
    expect(res.body.history['662577']).toEqual([{ date: '2024-01-01', close: 20000 }]);
    expect(taseHistoryApi.fetchTaseHistoricalCloses).toHaveBeenCalledWith('629014', '2024-01-01');
  });

  test('POST /api/israeli-stocks-history degrades a single failing symbol to an empty array without failing the whole batch', async () => {
    taseHistoryApi.fetchTaseHistoricalCloses
      .mockResolvedValueOnce([{ date: '2024-01-01', close: 100 }])
      .mockRejectedValueOnce(new Error('network down'));
    const res = await post(`${baseUrl}/api/israeli-stocks-history`, { symbols: ['629014', '999999'] });
    expect(res.status).toBe(200);
    expect(res.body.history['629014']).toEqual([{ date: '2024-01-01', close: 100 }]);
    expect(res.body.history['999999']).toEqual([]);
  });

  test('POST /api/american-stocks-history normalizes symbols to uppercase', async () => {
    yahooQuotes.fetchYahooHistoricalCloses.mockResolvedValue([{ date: '2024-01-01', close: 190 }]);
    const res = await post(`${baseUrl}/api/american-stocks-history`, { symbols: ['aapl'] });
    expect(res.status).toBe(200);
    expect(res.body.history.AAPL).toEqual([{ date: '2024-01-01', close: 190 }]);
    expect(yahooQuotes.fetchYahooHistoricalCloses).toHaveBeenCalledWith('AAPL', undefined);
  });

  test('GET /api/exchange-rate-history returns the FX series and degrades to an empty array on failure', async () => {
    yahooQuotes.fetchYahooHistoricalCloses.mockRejectedValueOnce(new Error('down'));
    const failRes = await get(`${baseUrl}/api/exchange-rate-history?from=2024-01-01`);
    expect(failRes.status).toBe(200);
    expect(failRes.body).toEqual({ history: [] });

    yahooQuotes.fetchYahooHistoricalCloses.mockResolvedValueOnce([{ date: '2024-01-01', close: 3.6 }]);
    const okRes = await get(`${baseUrl}/api/exchange-rate-history?from=2024-02-01`);
    expect(okRes.status).toBe(200);
    expect(okRes.body).toEqual({ history: [{ date: '2024-01-01', close: 3.6 }] });
    expect(yahooQuotes.fetchYahooHistoricalCloses).toHaveBeenCalledWith('USDILS=X', '2024-02-01');
  });
});
