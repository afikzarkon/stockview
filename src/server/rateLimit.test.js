/**
 * @jest-environment node
 */
const { createRateLimiter } = require('./rateLimit');

function makeReqRes(ip) {
  const req = { ip };
  const headers = {};
  const res = {
    statusCode: null,
    body: null,
    setHeader: (name, value) => { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    headers
  };
  return { req, res };
}

describe('createRateLimiter', () => {
  test('allows requests under the limit and calls next', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 3 });
    const next = jest.fn();
    const { req, res } = makeReqRes('1.1.1.1');

    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(3);
    expect(res.statusCode).toBeNull();
  });

  test('blocks with 429 once the limit is exceeded', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 2, message: 'too many' });
    const next = jest.fn();
    const { req, res } = makeReqRes('2.2.2.2');

    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.statusCode).toBe(429);
    expect(res.body).toEqual({ error: 'too many' });
    expect(res.headers['Retry-After']).toBeDefined();
  });

  test('tracks separate clients independently', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
    const next = jest.fn();
    const a = makeReqRes('3.3.3.3');
    const b = makeReqRes('4.4.4.4');

    limiter(a.req, a.res, next);
    limiter(b.req, b.res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(a.res.statusCode).toBeNull();
    expect(b.res.statusCode).toBeNull();
  });

  test('resets the count after the window elapses', () => {
    jest.useFakeTimers();
    try {
      const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
      const next = jest.fn();
      const { req, res } = makeReqRes('5.5.5.5');

      limiter(req, res, next);
      limiter(req, res, next);
      expect(res.statusCode).toBe(429);

      jest.advanceTimersByTime(1001);
      res.statusCode = null;
      limiter(req, res, next);
      expect(res.statusCode).toBeNull();
      expect(next).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('reset() clears all tracked clients', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 1 });
    const next = jest.fn();
    const { req, res } = makeReqRes('6.6.6.6');

    limiter(req, res, next);
    limiter(req, res, next);
    expect(res.statusCode).toBe(429);

    limiter.reset();
    res.statusCode = null;
    limiter(req, res, next);
    expect(res.statusCode).toBeNull();
  });
});
