// Login, sessions, token handling, rate limiting and route protection. Real Express app, in-memory data, no MySQL.
// Runs with the default MESSAGE_DELIVERY=none, so it also proves that nothing claims a message was delivered.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { store } = require('../../repositories/memory/store');
const clock = require('@pos-cafe/shared/clock');
const { useTestServer, createUser, tokenFor, addShop, DEFAULT_PASSWORD } = require('./helpers');

const { ctx, api } = useTestServer();
const A = '/api/v1/auth';
const login = (json) => api('POST', `${A}/login`, { json });

async function seedOwner() {
  const user = await createUser({ id: 1, accountId: 1, email: 'owner@poscafe.com', firstName: 'Michel', lastName: 'Parede' });
  await addShop(1, 'POS CAFE');
  return user;
}

test('login: a registered user gets an access token and a safe user object', async () => {
  await seedOwner();
  const res = await login({ email: 'owner@poscafe.com', password: DEFAULT_PASSWORD });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const { token, tokenType, expiresAt, user } = res.body.data;
  assert.equal(tokenType, 'Bearer');
  assert.match(token, /^[\w-]+\.[\w-]+\.[\w-]+$/);
  assert.ok(new Date(expiresAt) > new Date());
  assert.deepEqual(user, { id: 1, firstName: 'Michel', lastName: 'Parede', email: 'owner@poscafe.com', phone: '+94 71 000 0000', role: 'Owner', accountId: 1 });
  assert.ok(!/passwordHash|scrypt|password/i.test(JSON.stringify(user)));
  assert.equal((await login({ email: 'OWNER@PosCafe.com', password: DEFAULT_PASSWORD })).status, 200); // email is case-insensitive
});

test('login: every failure looks the same (no account enumeration)', async () => {
  await seedOwner();
  await createUser({ id: 2, accountId: 1, role: 'admin', email: 'off@poscafe.com', status: 'disabled' });
  const wrongPassword = await login({ email: 'owner@poscafe.com', password: 'Wrong@1234' });
  const unknownEmail = await login({ email: 'nobody@poscafe.com', password: DEFAULT_PASSWORD });
  const disabled = await login({ email: 'off@poscafe.com', password: DEFAULT_PASSWORD });
  for (const res of [wrongPassword, unknownEmail, disabled]) assert.equal(res.status, 401);
  assert.deepEqual(unknownEmail.body, wrongPassword.body);
  assert.deepEqual(disabled.body, wrongPassword.body);
  assert.equal(wrongPassword.body.code, 'INVALID_CREDENTIALS');
});

test('login: malformed input is a 400 and never echoes the password', async () => {
  await seedOwner();
  for (const json of [{}, { email: 'x' }, { email: 'owner@poscafe.com' }, { email: 'owner@poscafe.com', password: '' }, { email: 'owner@poscafe.com', password: 5 },
    { email: 'owner@poscafe.com', password: 'x'.repeat(129) }, { email: 'owner@poscafe.com', password: 'a', keepSignedIn: 'yes' }, [], 'text']) {
    const res = await login(json);
    assert.equal(res.status, 400, JSON.stringify(json));
    assert.ok(!res.text.includes('x'.repeat(129)));
  }
});

test('login: repeated attempts are rate limited per IP and email', async () => {
  await seedOwner();
  for (let i = 0; i < 10; i += 1) assert.equal((await login({ email: 'owner@poscafe.com', password: 'Wrong@1234' })).status, 401);
  const blocked = await login({ email: 'owner@poscafe.com', password: DEFAULT_PASSWORD }); // even the right password is refused now
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, 'TOO_MANY_REQUESTS');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal((await login({ email: 'other@poscafe.com', password: 'x' })).status, 401, 'another email has its own bucket');
  clock.advance(15 * 60 * 1000 + 1000);
  assert.equal((await login({ email: 'owner@poscafe.com', password: DEFAULT_PASSWORD })).status, 200);
});

test('protected routes: /me needs a valid bearer token', async () => {
  await seedOwner();
  const none = await api('GET', `${A}/me`);
  assert.equal(none.status, 401);
  assert.equal(none.headers.get('www-authenticate'), 'Bearer');
  const { token } = (await login({ email: 'owner@poscafe.com', password: DEFAULT_PASSWORD })).body.data;
  const ok = await api('GET', `${A}/me`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.body.data.id, ok.body.data.role, ok.body.data.shops], [1, 'Owner', [{ id: 1, name: 'POS CAFE' }]]);
  assert.ok(!/passwordHash|scrypt/i.test(ok.text));
  for (const headers of [{ authorization: `Basic ${token}` }, { authorization: 'Bearer' }, { authorization: `Bearer ${token}x` }, { authorization: 'Bearer not.a.token' }, { authorization: token }]) {
    assert.equal((await api('GET', `${A}/me`, { headers })).status, 401, JSON.stringify(headers));
  }
  const [h, p, s] = token.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url')), sub: 99 })).toString('base64url');
  assert.equal((await api('GET', `${A}/me`, { headers: { authorization: `Bearer ${h}.${forgedPayload}.${s}` } })).status, 401);
});

test('logout revokes only that session', async () => {
  await seedOwner();
  const one = (await login({ email: 'owner@poscafe.com', password: DEFAULT_PASSWORD })).body.data.token;
  const two = (await login({ email: 'owner@poscafe.com', password: DEFAULT_PASSWORD })).body.data.token;
  const me = (token) => api('GET', `${A}/me`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal((await api('POST', `${A}/logout`, { headers: { authorization: `Bearer ${one}` } })).status, 200);
  assert.equal((await me(one)).status, 401, 'the revoked token stops working at once');
  assert.equal((await me(two)).status, 200, 'the other session is untouched');
  assert.equal((await api('POST', `${A}/logout`)).status, 401);
});

test('tokens and sessions expire; "keep me signed in" lasts longer', async () => {
  await seedOwner();
  const short = (await login({ email: 'owner@poscafe.com', password: DEFAULT_PASSWORD })).body.data.token;
  const long = (await login({ email: 'owner@poscafe.com', password: DEFAULT_PASSWORD, keepSignedIn: true })).body.data.token;
  const me = (token) => api('GET', `${A}/me`, { headers: { authorization: `Bearer ${token}` } });
  clock.advance(11 * 3600 * 1000);
  assert.equal((await me(short)).status, 200);
  clock.advance(2 * 3600 * 1000); // 13 hours
  assert.equal((await me(short)).status, 401);
  assert.equal((await me(long)).status, 200);
  clock.advance(31 * 24 * 3600 * 1000);
  assert.equal((await me(long)).status, 401);
});

test('a disabled user is cut off immediately', async () => {
  await seedOwner();
  const { token } = (await login({ email: 'owner@poscafe.com', password: DEFAULT_PASSWORD })).body.data;
  store.adminProfiles.get(1).status = 'disabled';
  assert.equal((await api('GET', `${A}/me`, { headers: { authorization: `Bearer ${token}` } })).status, 401);
});

test('protected routes need sign-in; public routes do not', async () => {
  await seedOwner();
  for (const [method, url] of [['POST', '/api/v1/auth/logout'], ['GET', '/api/v1/auth/me']]) {
    assert.equal((await api(method, url)).status, 401, url);
  }
  const { token } = await tokenFor(1);
  assert.equal((await api('GET', '/api/v1/auth/me', { headers: { authorization: `Bearer ${token}` } })).status, 200);
  assert.equal((await api('GET', '/health')).status, 200);
  assert.equal((await api('POST', '/api/v1/auth/login', { json: {} })).status, 400); // reachable without a token
});

test('with no email/SMS provider, nothing claims a message was delivered and the dev outbox does not exist', async () => {
  const res = await api('POST', `${A}/signup/credentials`, { json: { email: 'new@poscafe.com', username: 'Jhon', password: DEFAULT_PASSWORD, acceptTerms: true } });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.data.delivery, { channel: 'email', delivered: false, reason: 'not_configured' });
  assert.equal(store.outbox.length, 0, 'nothing was captured or sent');
  assert.equal((await api('GET', '/api/v1/dev/outbox')).status, 404);
  const forgot = await api('POST', `${A}/forgot-password`, { json: { email: 'new@poscafe.com' } });
  assert.equal(forgot.body.data.deliveryConfigured, false);
});

test('the service listens on the loopback address only (CORS is handled by the Gateway)', async () => {
  assert.equal(ctx.server.address().address, '127.0.0.1');
  const preflight = await api('OPTIONS', `${A}/login`, { headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST' } });
  assert.equal(preflight.headers.get('access-control-allow-origin'), null);
});
