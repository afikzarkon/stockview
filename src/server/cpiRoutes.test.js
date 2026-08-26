/**
 * @jest-environment node
 */
jest.mock('axios');

const http = require('http');
const express = require('express');
const axios = require('axios');
const { mountCpiRoutes } = require('./cpiRoutes');

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

function post(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(body); } catch { parsed = null; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

describe('cpiRoutes', () => {
  let app;
  let server;
  let baseUrl;

  beforeEach((done) => {
    axios.get.mockReset();
    app = express();
    app.use(express.json());
    mountCpiRoutes(app);
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      done();
    });
  });

  afterEach((done) => {
    server.close(done);
  });

  test('GET /api/cpi/month/:yyyymm rejects an invalid month format', async () => {
    const res = await get(`${baseUrl}/api/cpi/month/2024`);
    expect(res.status).toBe(400);
  });

  test('GET /api/cpi/month/:yyyymm returns the index value for a valid month', async () => {
    axios.get.mockResolvedValue({
      data: { month_data: [{ date: '2023-06-15', currBase: [{ index: 115.4 }] }] }
    });
    const res = await get(`${baseUrl}/api/cpi/month/2023-06`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ month: '2023-06', value: 115.4 });
  });

  test('GET /api/cpi/month/:yyyymm returns 404 when the CBS API has no data for that month', async () => {
    axios.get.mockResolvedValue({ data: { month_data: [] } });
    const res = await get(`${baseUrl}/api/cpi/month/1999-01`);
    expect(res.status).toBe(404);
  });

  test('GET /api/cpi/month/:yyyymm degrades gracefully (502) when the CBS API is unreachable', async () => {
    axios.get.mockRejectedValue(new Error('network down'));
    const res = await get(`${baseUrl}/api/cpi/month/2023-06`);
    expect(res.status).toBe(502);
  });

  test('GET /api/cpi/latest returns the most recent index and caches it in memory', async () => {
    axios.get.mockResolvedValue({
      data: { month_data: [{ date: '2024-05-15', currBase: [{ index: 128.9 }] }] }
    });
    const res = await get(`${baseUrl}/api/cpi/latest`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ month: '2024-05', value: 128.9 });

    // Second call should be served from the in-memory cache, not a new HTTP call.
    const callsBefore = axios.get.mock.calls.length;
    const res2 = await get(`${baseUrl}/api/cpi/latest`);
    expect(res2.status).toBe(200);
    expect(axios.get.mock.calls.length).toBe(callsBefore);
  });

  test('POST /api/cpi/months returns a map of month -> index value for multiple months', async () => {
    axios.get.mockImplementation((url, config) => {
      const period = config.params.startPeriod; // "202301" or "202306"
      const map = {
        '202301': { date: '2023-01-15', currBase: [{ index: 110 }] },
        '202306': { date: '2023-06-15', currBase: [{ index: 115.4 }] }
      };
      return Promise.resolve({ data: { month_data: [map[period]] } });
    });
    const res = await post(`${baseUrl}/api/cpi/months`, { months: ['2023-01', '2023-06'] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ '2023-01': 110, '2023-06': 115.4 });
  });
});
