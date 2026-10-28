// Forgot password -> code -> reset. MESSAGE_DELIVERY=dev-outbox lets the tests read the codes a real provider WOULD
// have sent (nothing is really sent). Covers account enumeration, expiry, attempts, reuse and session revocation.
process.env.MESSAGE_DELIVERY = 'dev-outbox';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { store } = require('../../repositories/memory/store');
const { verifyPassword } = require('@pos-cafe/shared/password');
const clock = require('@pos-cafe/shared/clock');
const { useTestServer, createUser, tokenFor, DEFAULT_PASSWORD } = require('./helpers');

const { api } = useTestServer();
const A = '/api/v1/auth';
const EMAIL = 'owner@poscafe.com';
const NEW_PASSWORD = 'NewPass#2026';
const post = (path, json) => api('POST', `${A}${path}`, { json });
const codeFor = (email) => [...store.outbox].reverse().find((m) => m.to === email && /\b\d{6}\b/.test(m.text)).text.match(/\b(\d{6})\b/)[1];
const wrong = (code) => (code === '000000' ? '111111' : '000000');
const forgot = (email = EMAIL) => post('/forgot-password', { email });
const verify = (code, email = EMAIL) => post('/forgot-password/verify', { email, code });
const reset = (resetToken, password = NEW_PASSWORD, confirmPassword = password) => post('/reset-password', { resetToken, password, confirmPassword });
const loginStatus = async (password, email = EMAIL) => (await post('/login', { email, password })).status;

async function seed() {
  await createUser({ id: 1, email: EMAIL });
}
async function getResetToken() {
  await forgot();
  const res = await verify(codeFor(EMAIL));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data.resetToken;
}

test('forgot -> verify -> reset changes the password, ends every session and spends the code and token', async () => {
  await seed();
  const { token: oldSession } = await tokenFor(1);
  const asked = await forgot();
  assert.equal(asked.status, 200);
  assert.deepEqual(asked.body.data, { deliveryConfigured: false }, 'the response says nothing about the account');
  assert.equal(store.outbox.length, 1);
  assert.equal(store.outbox[0].subject, 'Your PAI POS password reset code');
  const code = codeFor(EMAIL);
  assert.ok(!asked.text.includes(code), 'the code is never in the API response');

  const verified = await verify(code);
  assert.equal(verified.status, 200);
  const { resetToken, expiresInSeconds } = verified.body.data;
  assert.equal(expiresInSeconds, 600);
  assert.equal((await verify(code)).status, 400, 'a spent code can not be used again');

  const done = await reset(resetToken);
  assert.deepEqual([done.status, done.body.message], [200, 'Password reset']);
  assert.ok(!done.text.includes(NEW_PASSWORD));
  assert.equal(await loginStatus(DEFAULT_PASSWORD), 401, 'the old password no longer works');
  assert.equal(await loginStatus(NEW_PASSWORD), 200, 'the new password works');
  assert.equal((await api('GET', `${A}/me`, { headers: { authorization: `Bearer ${oldSession}` } })).status, 401, 'the old session was revoked');
  assert.equal((await reset(resetToken, 'Another#2026')).status, 400, 'a reset token works once');
  assert.equal(await verifyPassword(NEW_PASSWORD, store.adminProfiles.get(1).passwordHash), true);
});

test('no account enumeration: known and unknown emails get identical answers', async () => {
  await seed();
  const known = await forgot(EMAIL);
  const unknown = await forgot('nobody@poscafe.com');
  assert.equal(known.status, unknown.status);
  assert.deepEqual(known.body, unknown.body);
  assert.equal(store.outbox.length, 1, 'a message exists only for the real account');
  assert.equal(store.outbox[0].to, EMAIL);

  const code = codeFor(EMAIL);
  const wrongForKnown = await verify(wrong(code));
  const anyForUnknown = await verify('123456', 'nobody@poscafe.com');
  assert.equal(wrongForKnown.status, 400);
  assert.deepEqual(anyForUnknown.body, wrongForKnown.body, 'a code failure never says whether the email exists');
  assert.equal(wrongForKnown.body.code, 'INVALID_CODE');

  // a second request inside the cooldown is swallowed, and still answers the same way
  const again = await forgot(EMAIL);
  assert.deepEqual(again.body, unknown.body);
  assert.equal(store.outbox.length, 1, 'no second code inside the cooldown');
});

test('reset codes: lock-out, expiry, replacement and the cooldown', async () => {
  await seed();
  await forgot();
  const code = codeFor(EMAIL);
  for (let i = 0; i < 5; i += 1) assert.equal((await verify(wrong(code))).status, 400);
  assert.equal((await verify(code)).status, 400, 'five wrong guesses lock the code');

  clock.advance(61 * 1000);
  await forgot();
  const fresh = codeFor(EMAIL);
  assert.equal(store.outbox.length, 2);
  if (fresh !== code) assert.equal((await verify(code)).status, 400, 'a new code replaces the old one');
  clock.advance(3 * 60 * 1000 + 1000);
  assert.equal((await verify(fresh)).status, 400, 'the code expires after three minutes');

  clock.advance(61 * 1000);
  await forgot();
  assert.equal((await verify(codeFor(EMAIL))).status, 200);
});

test('the reset token expires after ten minutes', async () => {
  await seed();
  const resetToken = await getResetToken();
  clock.advance(10 * 60 * 1000 + 1000);
  const res = await reset(resetToken);
  assert.deepEqual([res.status, res.body.code], [400, 'INVALID_RESET_TOKEN']);
  assert.equal(await loginStatus(DEFAULT_PASSWORD), 200, 'nothing changed');
});

test('the new password is checked on the server and a failed check keeps the token usable', async () => {
  await seed();
  const resetToken = await getResetToken();
  const bad = async (password, confirm, field) => {
    store.rateLimits.clear(); // this test sends many requests; the rate limit is tested elsewhere
    const res = await reset(resetToken, password, confirm);
    assert.equal(res.status, 400, `${password} / ${confirm}`);
    assert.ok(res.body.errors.some((e) => e.field === field), JSON.stringify(res.body.errors));
    assert.ok(!res.text.includes(password) || password === '', 'the password is never echoed');
    return res;
  };
  for (const password of ['Sh0rt!A', 'alllowercase1!', 'ALLUPPERCASE1!', 'NoNumbers!!', 'NoSymbols123', 'Has Space1!', '', 'x'.repeat(129)]) await bad(password, password, 'password');
  assert.equal((await bad('weak', 'weak', 'password')).body.errors[0].message, 'Use 8 characters with uppercase, lowercase, numbers, and symbols. No spaces.');
  await bad(NEW_PASSWORD, 'Different#2026', 'confirmPassword');
  await bad(NEW_PASSWORD, null, 'confirmPassword'); // missing confirmation (null, because undefined would use the helper's default)
  const sameAsOld = await bad(DEFAULT_PASSWORD, DEFAULT_PASSWORD, 'password');
  assert.match(sameAsOld.body.errors[0].message, /different from your previous password/);
  assert.equal((await reset(resetToken)).status, 200, 'the token was not spent by the failed attempts');
});

test('other bad reset requests', async () => {
  await seed();
  assert.equal((await reset('a'.repeat(43))).body.code, 'INVALID_RESET_TOKEN');
  assert.equal((await post('/reset-password', { password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD })).status, 400);
  assert.equal((await post('/forgot-password', { email: 'nope' })).status, 400);
  assert.equal((await post('/forgot-password/verify', { email: EMAIL, code: '12' })).status, 400);
  assert.equal((await post('/forgot-password', {})).status, 400);
  const resetToken = await getResetToken();
  assert.equal((await reset(resetToken.slice(0, -1) + (resetToken.endsWith('A') ? 'B' : 'A'))).status, 400, 'a changed token is refused');
});

test('resetting signs out every session of that user, and only that user', async () => {
  await seed();
  await createUser({ id: 2, email: 'other@poscafe.com' });
  const one = (await tokenFor(1)).token;
  const two = (await tokenFor(1)).token;
  const other = (await tokenFor(2)).token;
  await reset(await getResetToken());
  const me = (token) => api('GET', `${A}/me`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal((await me(one)).status, 401);
  assert.equal((await me(two)).status, 401);
  assert.equal((await me(other)).status, 200);
});

test('forgot-password is rate limited per email and per IP, known or not', async () => {
  await seed();
  for (let i = 0; i < 5; i += 1) assert.equal((await forgot(EMAIL)).status, 200);
  const blocked = await forgot(EMAIL);
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  for (let i = 0; i < 5; i += 1) assert.equal((await forgot('nobody@poscafe.com')).status, 200);
  assert.equal((await forgot('nobody@poscafe.com')).status, 429, 'an unknown email is limited exactly the same way');
  clock.advance(60 * 60 * 1000 + 1000);
  assert.equal((await forgot(EMAIL)).status, 200);
});

test('a disabled account gets the same public answer but no code', async () => {
  await createUser({ id: 1, email: EMAIL, status: 'disabled' });
  const res = await forgot();
  assert.equal(res.status, 200);
  assert.equal(store.outbox.length, 0);
});
