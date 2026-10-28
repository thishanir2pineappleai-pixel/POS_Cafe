// Unit tests for the access-token service (HS256 built on Node's crypto; no package, no database).
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwtService = require('../../services/auth/jwtService');
const clock = require('@pos-cafe/shared/clock');
const { reset } = require('../../repositories/memory/store');

beforeEach(() => reset());

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const parts = (token) => token.split('.');

test('sign and verify round trip', () => {
  const { token, expiresAt } = jwtService.sign({ sub: 7, sid: 'abc' });
  assert.equal(parts(token).length, 3);
  const payload = jwtService.verify(token);
  assert.equal(payload.sub, 7);
  assert.equal(payload.sid, 'abc');
  assert.equal(payload.iss, 'pos-cafe');
  assert.equal(payload.exp * 1000, expiresAt);
});

test('a changed payload or signature is rejected', () => {
  const [h, p, s] = parts(jwtService.sign({ sub: 7 }).token);
  const forged = b64({ ...JSON.parse(Buffer.from(p, 'base64url')), sub: 1 });
  assert.equal(jwtService.verify(`${h}.${forged}.${s}`), null);
  assert.equal(jwtService.verify(`${h}.${p}.${s.slice(0, -2)}AA`), null);
  assert.equal(jwtService.verify(`${h}.${p}.`), null);
});

test('a token signed with another secret is rejected', () => {
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 7, iss: 'pos-cafe', exp: Math.floor(Date.now() / 1000) + 600 })}`;
  const sig = crypto.createHmac('sha256', 'some-other-secret-of-sufficient-length-1234').update(body).digest('base64url');
  assert.equal(jwtService.verify(`${body}.${sig}`), null);
});

test('algorithm "none" and other algorithms are rejected', () => {
  const payload = b64({ sub: 7, iss: 'pos-cafe', exp: Math.floor(Date.now() / 1000) + 600 });
  assert.equal(jwtService.verify(`${b64({ alg: 'none', typ: 'JWT' })}.${payload}.`), null);
  assert.equal(jwtService.verify(`${b64({ alg: 'none', typ: 'JWT' })}.${payload}`), null);
  const [, p, s] = parts(jwtService.sign({ sub: 7 }).token);
  assert.equal(jwtService.verify(`${b64({ alg: 'HS512', typ: 'JWT' })}.${p}.${s}`), null);
});

test('an expired token is rejected, using the shared clock', () => {
  const { token } = jwtService.sign({ sub: 7 }, { ttlSeconds: 60 });
  assert.ok(jwtService.verify(token));
  clock.advance(59 * 1000);
  assert.ok(jwtService.verify(token));
  clock.advance(2 * 1000);
  assert.equal(jwtService.verify(token), null);
});

test('malformed input is simply null', () => {
  for (const value of [undefined, null, 5, {}, '', 'abc', 'a.b', 'a.b.c', 'a.b.c.d', '....']) assert.equal(jwtService.verify(value), null, String(value));
});
