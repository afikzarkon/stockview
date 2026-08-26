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

// בונה תגובת CBS "אמיתית" (המבנה שאומת מול השרת החי ב-26.8.2026) עבור
// רשימת נקודות { year, month, value }.
function cbsResponse(points) {
  return {
    data: {
      month: [
        {
          code: 120010,
          name: 'Consumer Price Index - General',
          date: points.map((p) => ({
            year: p.year,
            month: p.month,
            currBase: { baseDesc: 'Average 2024', value: p.value },
            prevBase: null,
            monthDesc: ''
          }))
        }
      ],
      quarter: null
    }
  };
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
    axios.get.mockResolvedValue(cbsResponse([{ year: 2023, month: 6, value: 115.4 }]));
    const res = await get(`${baseUrl}/api/cpi/month/2023-06`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ month: '2023-06', value: 115.4 });
  });

  test('GET /api/cpi/month/:yyyymm zero-pads single-digit months (e.g. month: 7 -> "2026-07")', async () => {
    axios.get.mockResolvedValue(cbsResponse([{ year: 2026, month: 7, value: 105.1 }]));
    const res = await get(`${baseUrl}/api/cpi/month/2026-07`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ month: '2026-07', value: 105.1 });
  });

  test('GET /api/cpi/month/:yyyymm returns 404 when the CBS API has no data for that month', async () => {
    axios.get.mockResolvedValue({ data: { month: [], quarter: null } });
    const res = await get(`${baseUrl}/api/cpi/month/1999-01`);
    expect(res.status).toBe(404);
  });

  test('GET /api/cpi/month/:yyyymm degrades gracefully (502) when the CBS API is unreachable', async () => {
    axios.get.mockRejectedValue(new Error('network down'));
    const res = await get(`${baseUrl}/api/cpi/month/2023-06`);
    expect(res.status).toBe(502);
  });

  test('GET /api/cpi/month/:yyyymm sends the period to CBS in mm-yyyy format, not yyyymm', async () => {
    axios.get.mockResolvedValue(cbsResponse([{ year: 2023, month: 6, value: 115.4 }]));
    await get(`${baseUrl}/api/cpi/month/2023-06`);
    const call = axios.get.mock.calls[0];
    expect(call[1].params.startPeriod).toBe('06-2023');
    expect(call[1].params.endPeriod).toBe('06-2023');
  });

  test('GET /api/cpi/latest returns the most recent index and caches it in memory', async () => {
    axios.get.mockResolvedValue(cbsResponse([{ year: 2026, month: 7, value: 105.1 }]));
    const res = await get(`${baseUrl}/api/cpi/latest`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ month: '2026-07', value: 105.1 });

    // Second call should be served from the in-memory cache, not a new HTTP call.
    const callsBefore = axios.get.mock.calls.length;
    const res2 = await get(`${baseUrl}/api/cpi/latest`);
    expect(res2.status).toBe(200);
    expect(axios.get.mock.calls.length).toBe(callsBefore);
  });

  test('POST /api/cpi/months returns a map of month -> index value for multiple months', async () => {
    axios.get.mockImplementation((url, config) => {
      const period = config.params.startPeriod; // "01-2023" or "06-2023" (mm-yyyy, per CBS API)
      const points = {
        '01-2023': { year: 2023, month: 1, value: 110 },
        '06-2023': { year: 2023, month: 6, value: 115.4 }
      };
      return Promise.resolve(cbsResponse([points[period]]));
    });
    const res = await post(`${baseUrl}/api/cpi/months`, { months: ['2023-01', '2023-06'] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ '2023-01': 110, '2023-06': 115.4 });
  });
});
