// Signed access tokens (JWT format, HS256) built on Node's crypto, so no JWT package is needed.
// verify() accepts ONLY alg HS256 (a token that claims "none" or anything else is rejected), checks the signature in
// constant time, then the issuer and expiry. It returns the payload, or null for any problem.
// Every service verifies tokens with this; only the Auth Service signs them.
const crypto = require('node:crypto');
const clock = require('./clock');

const JWT_ISSUER = 'pos-cafe';

const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

function createJwt({ secret, issuer, ttlSeconds: defaultTtl }) {
  const hmac = (data) => crypto.createHmac('sha256', secret).update(data).digest();

  function sign(claims, { ttlSeconds = defaultTtl } = {}) {
    const iat = Math.floor(clock.now() / 1000);
    const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ ...claims, iss: issuer, iat, exp: iat + ttlSeconds })}`;
    return { token: `${body}.${hmac(body).toString('base64url')}`, expiresAt: (iat + ttlSeconds) * 1000 };
  }

  function verify(token) {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    try {
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      if (header.alg !== 'HS256') return null;
      const given = Buffer.from(parts[2], 'base64url');
      const expected = hmac(`${parts[0]}.${parts[1]}`);
      if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      if (payload.iss !== issuer || typeof payload.exp !== 'number' || payload.exp * 1000 <= clock.now()) return null;
      return payload;
    } catch {
      return null;
    }
  }

  return { sign, verify };
}

module.exports = { createJwt, JWT_ISSUER };
