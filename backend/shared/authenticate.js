// Authentication shared by every service. A protected request needs "Authorization: Bearer <access token>" and passes
// two checks, so logout and session revocation work everywhere:
//   1. the token's signature, issuer and expiry are verified LOCALLY with the shared JWT secret;
//   2. the session behind the token is confirmed active by the Auth Service (verifySession).
// If the Auth Service cannot be reached the request FAILS CLOSED (503): a session that cannot be confirmed is not trusted.
// On success req.auth = { userId, accountId, role, sessionId }; every other failure is the same 401.
const crypto = require('node:crypto');
const { ERROR_CODES, AppError } = require('./errors');
const { MESSAGES } = require('./messages');

const reject = (message) => new AppError(401, ERROR_CODES.UNAUTHENTICATED, message);

// verifySession({ sessionId, userId }) -> { userId, accountId, role, sessionId } | null (not active), or throws.
function createAuthenticate({ jwt, verifySession }) {
  return async function authenticate(req, res, next) {
    try {
      const [scheme, token] = (req.get('authorization') || '').split(' ');
      if (scheme?.toLowerCase() !== 'bearer' || !token) return next(reject(MESSAGES.AUTH_REQUIRED));
      const payload = jwt.verify(token);
      if (!payload) return next(reject(MESSAGES.AUTH_INVALID));
      const auth = await verifySession({ sessionId: payload.sid, userId: payload.sub });
      if (!auth) return next(reject(MESSAGES.AUTH_INVALID));
      req.auth = auth;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

const unavailable = () => new AppError(503, ERROR_CODES.SERVICE_UNAVAILABLE, MESSAGES.AUTH_SERVICE_UNAVAILABLE);

// The verifySession used by services other than the Auth Service: asks POST {baseUrl}/internal/sessions/verify.
// 200 with { active, auth } is the answer. Anything else (down, timeout, wrong internal key, 5xx) fails closed with 503.
function createAuthServiceClient({ baseUrl, internalKey, timeoutMs = 3000 }) {
  return async function verifySession({ sessionId, userId }) {
    let res;
    try {
      res = await fetch(`${typeof baseUrl === 'function' ? baseUrl() : baseUrl}/internal/sessions/verify`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-key': internalKey },
        body: JSON.stringify({ sessionId, userId }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw unavailable();
    }
    if (res.status !== 200) throw unavailable();
    const data = (await res.json().catch(() => null))?.data;
    if (data?.active === false) return null;
    if (data?.active !== true || !data.auth) throw unavailable();
    return data.auth;
  };
}

// Protects internal endpoints: the caller must send the shared X-Internal-Key. Compared in constant time.
function requireInternalKey(internalKey) {
  const expected = crypto.createHash('sha256').update(internalKey).digest();
  return (req, res, next) => {
    const given = crypto.createHash('sha256').update(String(req.get('x-internal-key') || '')).digest();
    return crypto.timingSafeEqual(given, expected) ? next() : next(new AppError(401, ERROR_CODES.UNAUTHENTICATED, MESSAGES.AUTH_REQUIRED));
  };
}

module.exports = { createAuthenticate, createAuthServiceClient, requireInternalKey };
