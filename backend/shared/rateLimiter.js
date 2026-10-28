// Sliding-window rate limiter kept in memory (temporary: the counters reset when the process restarts and they are per
// process; several instances of a service need a shared store such as Redis).
// rateLimit({ name, windowMs, max, key }) counts EVERY request that reaches it and answers 429 with Retry-After once a
// key has made `max` requests inside the window. `key(req)` must not depend on whether an account exists.
const { ERROR_CODES, AppError } = require('./errors');
const { MESSAGES } = require('./messages');
const clock = require('./clock');

// hits: the Map this service keeps its counters in (a service's tests can clear it).
function createRateLimiter(hits) {
  function rateLimit({ name, windowMs, max, key }) {
    return (req, res, next) => {
      const now = clock.now();
      const id = `${name}:${key(req)}`;
      const recent = (hits.get(id) || []).filter((t) => now - t < windowMs);
      if (recent.length >= max) {
        const err = new AppError(429, ERROR_CODES.TOO_MANY_REQUESTS, MESSAGES.TOO_MANY);
        err.retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
        hits.set(id, recent);
        return next(err);
      }
      recent.push(now);
      hits.set(id, recent);
      return next();
    };
  }

  // Key helpers. Emails are lower-cased so "A@x.com" and "a@x.com" share one bucket.
  const byIp = (req) => req.ip;
  const byEmail = (req) => String(req.body?.email ?? '').trim().toLowerCase();
  const byIpAndEmail = (req) => `${req.ip}|${byEmail(req)}`;

  return { rateLimit, byIp, byEmail, byIpAndEmail };
}

module.exports = { createRateLimiter };
