// Minimal in-memory fixed-window rate limiter. No external dependency needed
// since this only has to survive a single server process (not multi-instance).
function createRateLimiter({ windowMs, max, message, keyFn }) {
  const hits = new Map(); // key -> { count, resetAt }

  function resolveKey(req) {
    if (keyFn) return keyFn(req);
    return req.ip;
  }

  function middleware(req, res, next) {
    const key = resolveKey(req);
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: message || 'יותר מדי בקשות, נסה שוב מאוחר יותר'
      });
    }

    next();
  }

  middleware.reset = () => hits.clear();
  return middleware;
}

module.exports = { createRateLimiter };
