/**
 * @jest-environment node
 */
jest.mock('./yahooQuotes', () => ({
  fetchYahooStockResearch: jest.fn(),
  fetchYahooSymbolSearch: jest.fn()
}));

const http = require('http');
const express = require('express');
const { mountStockResearchRoutes } = require('./stockResearchRoutes');
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

describe('stockResearchRoutes', () => {
  let app;
  let server;
  let baseUrl;

  beforeAll((done) => {
    app = express();
    mountStockResearchRoutes(app);
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    yahooQuotes.fetchYahooStockResearch.mockReset();
    yahooQuotes.fetchYahooSymbolSearch.mockReset();
  });

  describe('GET /api/stock-research/:symbol', () => {
    test('returns the research data, uppercasing the symbol', async () => {
      yahooQuotes.fetchYahooStockResearch.mockResolvedValue({ trailingPE: 26.6 });
      const res = await get(`${baseUrl}/api/stock-research/koal1`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ symbol: 'KOAL1', research: { trailingPE: 26.6 } });
      expect(yahooQuotes.fetchYahooStockResearch).toHaveBeenCalledWith('KOAL1');
    });

    test('returns 502 (not a crash) when the fetch fails', async () => {
      yahooQuotes.fetchYahooStockResearch.mockRejectedValue(new Error('quoteSummary down'));
      const res = await get(`${baseUrl}/api/stock-research/BADTICKER`);
      expect(res.status).toBe(502);
      expect(res.body.error).toBeTruthy();
    });

    test('caches per symbol so a repeat request does not re-fetch', async () => {
      yahooQuotes.fetchYahooStockResearch.mockResolvedValue({ trailingPE: 1 });
      await get(`${baseUrl}/api/stock-research/NVDA`);
      await get(`${baseUrl}/api/stock-research/NVDA`);
      expect(yahooQuotes.fetchYahooStockResearch).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/stock-search', () => {
    test('returns results for a valid query', async () => {
      yahooQuotes.fetchYahooSymbolSearch.mockResolvedValue([{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' }]);
      const res = await get(`${baseUrl}/api/stock-search?q=apple`);
      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([{ symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ' }]);
    });

    test('returns an empty array without calling Yahoo for a too-short query', async () => {
      const res = await get(`${baseUrl}/api/stock-search?q=a`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ results: [] });
      expect(yahooQuotes.fetchYahooSymbolSearch).not.toHaveBeenCalled();
    });

    test('returns an empty array (not an error) when the search fetch fails', async () => {
      yahooQuotes.fetchYahooSymbolSearch.mockRejectedValue(new Error('down'));
      const res = await get(`${baseUrl}/api/stock-search?q=xyzzy`);
      expect(res.status).toBe(200);
      expect(res.body.results).toEqual([]);
    });

    test('caches per query so a repeat request does not re-fetch', async () => {
      yahooQuotes.fetchYahooSymbolSearch.mockResolvedValue([]);
      await get(`${baseUrl}/api/stock-search?q=tesla`);
      await get(`${baseUrl}/api/stock-search?q=tesla`);
      expect(yahooQuotes.fetchYahooSymbolSearch).toHaveBeenCalledTimes(1);
    });
  });
});
