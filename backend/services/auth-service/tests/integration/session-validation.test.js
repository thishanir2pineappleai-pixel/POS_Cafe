// The contract other services rely on: every service verifies the JWT locally (@pos-cafe/shared/authenticate) AND asks this
// service whether the session is still active (POST /internal/sessions/verify). A consumer app protected exactly like the
// future services is started here and pointed at the real Auth Service app.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const express = require('express');
const clock = require('@pos-cafe/shared/clock');
const { createJwt } = require('@pos-cafe/shared/jwt');
const errorHandler = require('@pos-cafe/shared/middleware/errorHandler');
const { createAuthenticate, createAuthServiceClient } = require('@pos-cafe/shared/authenticate');
const { createApp } = require('../../app');
const { env } = require('../../config');
const { store } = require('../../repositories/memory/store');
const { useTestServer, createUser, tokenFor, DEFAULT_PASSWORD } = require('./helpers');

const { ctx, api } = useTestServer();
const jwt = createJwt({ secret: env.jwtSecret, issuer: 'pos-cafe', ttlSeconds: 3600 }); // what a consumer builds from JWT_SECRET
const keyHeader = { 'x-internal-key': env.internalKey };
const consumers = [];

// A consumer service with one protected route. authBase decides which Auth Service it asks.
async function startConsumer({ authBase = () => ctx.base, internalKey = env.internalKey, timeoutMs = 500 } = {}) {
  const app = express();
  const verifySession = (arg) => createAuthServiceClient({ baseUrl: authBase(), internalKey, timeoutMs })(arg);
  app.get('/private', createAuthenticate({ jwt, verifySession }), (req, res) => res.json({ success: true, data: req.auth }));
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  consumers.push(server);
  const base = `http://127.0.0.1:${server.address().port}`;
  return (token) => fetch(`${base}/private`, { headers: token ? { authorization: `Bearer ${token}` } : {} }).then(async (r) => ({ status: r.status, body: await r.json() }));
}

let call;
before(async () => { call = await startConsumer(); });
after(() => Promise.all(consumers.map((s) => new Promise((resolve) => s.close(resolve)))));

const seedOwner = () => createUser({ id: 1, accountId: 7, role: 'owner', email: 'owner@poscafe.com' });

test('internal endpoint: needs the internal key, answers active or not active, rejects a bad body', async () => {
  await seedOwner();
  const { sid } = await tokenFor(1);
  const verify = (body, headers = keyHeader) => api('POST', '/internal/sessions/verify', { json: body, headers });

  assert.equal((await verify({ sessionId: sid, userId: 1 }, {})).status, 401, 'no key');
  assert.equal((await verify({ sessionId: sid, userId: 1 }, { 'x-internal-key': 'x'.repeat(40) })).status, 401, 'wrong key');
  const ok = await verify({ sessionId: sid, userId: 1 });
  assert.deepEqual([ok.status, ok.body.data], [200, { active: true, auth: { userId: 1, accountId: 7, role: 'owner', sessionId: sid } }]);
  assert.deepEqual((await verify({ sessionId: sid, userId: 2 })).body.data, { active: false }, 'session of another user');
  assert.deepEqual((await verify({ sessionId: 'nope', userId: 1 })).body.data, { active: false }, 'unknown session');
  assert.equal((await verify({ sessionId: 5, userId: 'x' })).status, 400);
  assert.equal((await api('GET', '/internal/sessions/verify', { headers: keyHeader })).status, 404, 'only POST exists');
});

test('a valid token and an active session pass; the consumer gets the identity', async () => {
  await seedOwner();
  const { token, sid } = await tokenFor(1);
  const res = await call(token);
  assert.deepEqual([res.status, res.body.data], [200, { userId: 1, accountId: 7, role: 'owner', sessionId: sid }]);
});

test('missing, malformed, tampered and expired tokens are 401 without trusting the session', async () => {
  await seedOwner();
  const { token } = await tokenFor(1);
  assert.equal((await call()).status, 401);
  assert.equal((await call('not.a.jwt')).status, 401);
  const [h, p, s] = token.split('.');
  // Change the FIRST signature character: all 6 bits of it count. (The last character holds only 4 meaningful bits, so
  // replacing the tail could decode to the very same signature about once in 1000 runs.)
  assert.equal((await call(`${h}.${p}.${s[0] === 'A' ? 'B' : 'A'}${s.slice(1)}`)).status, 401, 'bad signature');
  const forged = createJwt({ secret: 'z'.repeat(40), issuer: 'pos-cafe', ttlSeconds: 60 }).sign({ sub: 1, sid: 'x' }).token;
  assert.equal((await call(forged)).status, 401, 'signed with another secret');
  clock.advance(2 * 3600 * 1000);
  assert.equal((await call(token)).status, 401, 'expired');
});

test('local checks come first: a bad token is 401 even while the Auth Service is down', async () => {
  const downCall = await startConsumer({ authBase: () => 'http://127.0.0.1:1' });
  assert.equal((await downCall('garbage')).status, 401);
  assert.equal((await downCall()).status, 401);
});

test('logout and a disabled user end the session for every service', async () => {
  await seedOwner();
  const login = await api('POST', '/api/v1/auth/login', { json: { email: 'owner@poscafe.com', password: DEFAULT_PASSWORD } });
  const token = login.body.data.token;
  assert.equal((await call(token)).status, 200);
  assert.equal((await api('POST', '/api/v1/auth/logout', { headers: { authorization: `Bearer ${token}` } })).status, 200);
  assert.equal((await call(token)).status, 401, 'revoked by logout');

  const second = (await tokenFor(1)).token;
  assert.equal((await call(second)).status, 200);
  store.adminProfiles.get(1).status = 'disabled';
  assert.equal((await call(second)).status, 401, 'inactive user');
});

test('fails closed (503) when the Auth Service is down, too slow or the internal key is wrong', async () => {
  await seedOwner();
  const { token } = await tokenFor(1);

  const down = await startConsumer({ authBase: () => 'http://127.0.0.1:1' });
  const res = await down(token);
  assert.deepEqual([res.status, res.body.code], [503, 'SERVICE_UNAVAILABLE']);

  const slow = http.createServer((req, res) => setTimeout(() => res.end('{}'), 1500));
  slow.listen(0, '127.0.0.1');
  await once(slow, 'listening');
  const slowCall = await startConsumer({ authBase: () => `http://127.0.0.1:${slow.address().port}`, timeoutMs: 200 });
  const started = Date.now();
  assert.equal((await slowCall(token)).status, 503);
  assert.ok(Date.now() - started < 1200, 'gave up at the timeout');
  slow.closeAllConnections();
  await new Promise((resolve) => slow.close(resolve));

  const wrongKey = await startConsumer({ internalKey: 'k'.repeat(40) });
  assert.equal((await wrongKey(token)).status, 503, 'a wrong key is never read as "session ok"');

  const broken = http.createServer((req, res) => res.end('{"success":true,"data":{"active":"maybe"}}'));
  broken.listen(0, '127.0.0.1');
  await once(broken, 'listening');
  const brokenCall = await startConsumer({ authBase: () => `http://127.0.0.1:${broken.address().port}` });
  assert.equal((await brokenCall(token)).status, 503, 'an answer that is not a clear yes or no is a no');
  await new Promise((resolve) => broken.close(resolve));
});

test('health endpoint answers and every response carries a request id', async () => {
  const other = createApp().listen(0, '127.0.0.1');
  await once(other, 'listening');
  const res = await fetch(`http://127.0.0.1:${other.address().port}/health`);
  assert.deepEqual((await res.json()).data, { service: 'auth-service', status: 'ok' });
  assert.ok(res.headers.get('x-request-id'));
  await new Promise((resolve) => other.close(resolve));
});
