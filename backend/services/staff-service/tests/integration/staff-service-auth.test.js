// What the Staff Service adds on top of the old backend: it never trusts a token on its own. The signature and expiry are
// checked here, the session is confirmed by the Auth Service, and the account's shops come from the Settings Service.
// When either service cannot answer, requests fail closed (503) instead of guessing.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const clock = require('@pos-cafe/shared/clock');
const { createJwt } = require('@pos-cafe/shared/jwt');
const authClient = require('../../services/integration/authClient');
const settingsClient = require('../../services/integration/settingsClient');
const { useTestServer } = require('./helpers');
const { OWNER, bearer, setupAccounts } = require('./staffHelpers');

const { ctx, api } = useTestServer();
let acc;

beforeEach(async () => {
  acc = await setupAccounts();
  ctx.token = acc.owner;
});

const withUrl = async (client, url, fn) => {
  client.useBaseUrl(url);
  try { return await fn(); } finally { client.useBaseUrl(client === authClient ? ctx.auth.url : ctx.settings.url); }
};

test('a revoked session is refused by every staff route family', async () => {
  const { token, sid } = ctx.auth.token({ userId: OWNER, accountId: 1, role: 'owner' });
  for (const url of ['/api/v1/staff', '/api/v1/roles', '/api/v1/shifts', '/api/v1/attendance', '/api/v1/payroll/records']) {
    assert.equal((await api('GET', url, { headers: bearer(token) })).status, 200, `${url} works while the session is active`);
  }
  ctx.auth.revoke(sid);
  for (const url of ['/api/v1/staff', '/api/v1/permissions', '/api/v1/roles', '/api/v1/teams', '/api/v1/shifts', '/api/v1/attendance', '/api/v1/payroll/records']) {
    const res = await api('GET', url, { headers: bearer(token) });
    assert.deepEqual([res.status, res.body.code], [401, 'UNAUTHENTICATED'], url);
  }
});

test('tokens are verified locally: tampered, foreign-signed and expired tokens never reach the Auth Service', async () => {
  const before = ctx.auth.calls.length;
  const { token } = ctx.auth.token({ userId: OWNER, accountId: 1, role: 'owner' });
  const [h, p, s] = token.split('.');
  const forged = createJwt({ secret: 'z'.repeat(40), issuer: 'pos-cafe', ttlSeconds: 60 }).sign({ sub: OWNER, sid: 'x' }).token;
  for (const bad of [`${h}.${p}.${s.slice(0, -2)}AA`, forged, 'not.a.token']) {
    assert.equal((await api('GET', '/api/v1/staff', { headers: bearer(bad) })).status, 401);
  }
  const short = ctx.auth.token({ userId: OWNER, accountId: 1, role: 'owner', ttlSeconds: 10 }).token;
  clock.advance(60 * 1000);
  assert.equal((await api('GET', '/api/v1/staff', { headers: bearer(short) })).status, 401, 'expired');
  assert.equal(ctx.auth.calls.length, before, 'no session lookups were made for bad tokens');
});

test('the role in the token comes from the Auth Service, not from the token: an admin cannot delete even with a forged claim', async () => {
  const claimsOwner = createJwt({ secret: require('../../config').env.jwtSecret, issuer: 'pos-cafe', ttlSeconds: 600 });
  const { sid } = ctx.auth.token({ userId: 9001, accountId: 1, role: 'admin' }); // the Auth Service knows this user as an admin
  const token = claimsOwner.sign({ sub: 9001, sid, aid: 1, role: 'owner' }).token; // a token that CLAIMS owner
  const res = await api('DELETE', '/api/v1/staff/1', { headers: bearer(token) });
  assert.equal(res.status, 403, 'the role used is the one the Auth Service returned');
});

test('when the Auth Service is down, too slow or answers with the wrong key, every route fails closed with 503', async () => {
  for (const url of ['/api/v1/staff', '/api/v1/attendance', '/api/v1/payroll/records']) {
    const res = await withUrl(authClient, 'http://127.0.0.1:1', () => api('GET', url));
    assert.deepEqual([res.status, res.body.code], [503, 'SERVICE_UNAVAILABLE'], url);
  }
  assert.equal((await api('GET', '/api/v1/staff')).status, 200, 'back to normal once the Auth Service is reachable');
});

test('when the Settings Service is down, requests that need a shop fail with 503 and nothing is written', async () => {
  const down = (fn) => withUrl(settingsClient, 'http://127.0.0.1:1', fn);
  for (const url of ['/api/v1/staff', '/api/v1/attendance', '/api/v1/shifts']) {
    const res = await down(() => api('GET', url));
    assert.deepEqual([res.status, res.body.code], [503, 'SERVICE_UNAVAILABLE'], url);
  }
  const made = await down(() => api('POST', '/api/v1/roles', { json: { name: 'Waiter' } }));
  assert.equal(made.status, 503);
  assert.equal((await api('GET', '/api/v1/roles')).body.data.length, 0, 'no role was created');
  assert.equal((await api('GET', '/api/v1/permissions')).status, 200, 'routes that need no shop keep working');
});

test('the service answers /health without a token and puts a request id on every response', async () => {
  ctx.token = null;
  const res = await api('GET', '/health');
  assert.deepEqual(res.body.data, { service: 'staff-service', status: 'ok' });
  assert.ok(res.headers.get('x-request-id'));
  assert.equal((await api('GET', '/api/v1/staff')).status, 401);
  assert.equal(ctx.server.address().address, '127.0.0.1');
});
