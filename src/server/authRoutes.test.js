/**
 * @jest-environment node
 */
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const { mountAuthRoutes } = require('./authRoutes');

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
          resolve({ status: res.statusCode, headers: res.headers, body: parsedBody });
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function makeStore() {
  return {
    findUserIdByEmail: jest.fn().mockResolvedValue(null),
    insertUser: jest.fn().mockResolvedValue({ id: 1 }),
    findUserForLogin: jest.fn().mockResolvedValue(null)
  };
}

describe('authRoutes rate limiting', () => {
  let app;
  let server;
  let baseUrl;
  let store;

  beforeEach((done) => {
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    store = makeStore();
    mountAuthRoutes(app, store);
    server = app.listen(0, () => {
      baseUrl = `http://localhost:${server.address().port}`;
      done();
    });
  });

  afterEach((done) => {
    server.close(done);
  });

  test('POST /api/auth/login returns 429 after exceeding the attempt limit', async () => {
    store.findUserForLogin.mockResolvedValue(null);

    let lastRes;
    for (let i = 0; i < 10; i += 1) {
      lastRes = await post(`${baseUrl}/api/auth/login`, { email: 'a@b.com', password: 'wrong-pass' });
      expect(lastRes.status).toBe(401);
    }

    const blocked = await post(`${baseUrl}/api/auth/login`, { email: 'a@b.com', password: 'wrong-pass' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBeTruthy();
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  test('POST /api/auth/register returns 429 after exceeding the attempt limit', async () => {
    store.findUserIdByEmail.mockResolvedValue(1); // every attempt is rejected as a duplicate

    let lastRes;
    for (let i = 0; i < 10; i += 1) {
      lastRes = await post(`${baseUrl}/api/auth/register`, { email: `user${i}@b.com`, password: 'password123' });
      expect(lastRes.status).toBe(409);
    }

    const blocked = await post(`${baseUrl}/api/auth/register`, { email: 'new@b.com', password: 'password123' });
    expect(blocked.status).toBe(429);
  });

  test('rate limiting on login does not block register from the same client', async () => {
    store.findUserForLogin.mockResolvedValue(null);
    for (let i = 0; i < 11; i += 1) {
      await post(`${baseUrl}/api/auth/login`, { email: 'a@b.com', password: 'wrong-pass' });
    }

    store.findUserIdByEmail.mockResolvedValue(null);
    const res = await post(`${baseUrl}/api/auth/register`, { email: 'fresh@b.com', password: 'password123' });
    expect(res.status).toBe(201);
  });
});
