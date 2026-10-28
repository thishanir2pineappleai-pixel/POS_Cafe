// Signup workflow: credentials -> email code -> owner details -> phone code -> business details -> access key -> activation.
// MESSAGE_DELIVERY=dev-outbox lets the tests read the codes that a real provider WOULD have sent (nothing is really
// sent). Each test file runs in its own process, so this setting does not leak into the other suites.
process.env.MESSAGE_DELIVERY = 'dev-outbox';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { store } = require('../../repositories/memory/store');
const { verifyPassword } = require('@pos-cafe/shared/password');
const clock = require('@pos-cafe/shared/clock');
const { useTestServer, createUser, DEFAULT_PASSWORD } = require('./helpers');

const { ctx, api } = useTestServer();
const A = '/api/v1/auth/signup';
const RULE_TEXT = 'Use 8 characters with uppercase, lowercase, numbers, and symbols. No spaces.';

const lastMessage = (channel, to) => [...store.outbox].reverse().find((m) => m.channel === channel && m.to === to);
// The newest message to that address that contains a six-digit code (the access-key email has none).
const codeFor = (channel, to) => [...store.outbox].reverse().find((m) => m.channel === channel && m.to === to && /\b\d{6}\b/.test(m.text)).text.match(/\b(\d{6})\b/)[1];
const keyFor = (email) => lastMessage('email', email).text.match(/[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}/)[0];
const wrong = (code) => (code === '000000' ? '111111' : '000000');
const post = (path, json) => api('POST', `${A}${path}`, { json });

const PERSON = { email: 'owner@poscafe.com', username: 'Jhon', password: DEFAULT_PASSWORD, acceptTerms: true };
async function start(over = {}) {
  const res = await post('/credentials', { ...PERSON, ...over });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.registrationToken;
}
async function toOwnerStep(over) {
  const token = await start(over);
  const email = over?.email ?? PERSON.email;
  assert.equal((await post('/email/verify', { registrationToken: token, code: codeFor('email', email) })).status, 200);
  return token;
}
async function toPhoneStep(phone = '0712345678', over) {
  const token = await toOwnerStep(over);
  const res = await post('/owner', { registrationToken: token, ownerName: 'Michel Parede', phone });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return token;
}
async function toBusinessStep(over) {
  const token = await toPhoneStep('0712345678', over);
  assert.equal((await post('/phone/verify', { registrationToken: token, code: codeFor('sms', '0712345678') })).status, 200);
  return token;
}
async function toActivation(over) {
  const token = await toBusinessStep(over);
  const res = await post('/business', { registrationToken: token, businessName: 'POS CAFE', address: 'Jaffna' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return token;
}

test('the whole signup, step by step, ends with a working owner account and shop', async () => {
  const created = await post('/credentials', PERSON);
  assert.equal(created.status, 201);
  assert.equal(created.body.data.nextStep, 'email_verification');
  assert.deepEqual(created.body.data.delivery, { channel: 'email', delivered: false, reason: 'captured_in_dev_outbox' }); // honest: nothing was sent
  assert.ok(!/password|hash|scrypt/i.test(created.text.replace('registrationToken', '')), 'no secret in the response');
  const token = created.body.data.registrationToken;
  assert.equal(lastMessage('email', 'owner@poscafe.com').subject, 'Your PAI POS verification code');

  const email = await post('/email/verify', { registrationToken: token, code: codeFor('email', 'owner@poscafe.com') });
  assert.deepEqual([email.status, email.body.data.nextStep], [200, 'owner_details']);

  const owner = await post('/owner', { registrationToken: token, ownerName: 'Michel Parede', phone: '+94 71 234 5678' });
  assert.deepEqual([owner.status, owner.body.data.nextStep, owner.body.data.delivery.channel], [200, 'phone_verification', 'sms']);

  const phone = await post('/phone/verify', { registrationToken: token, code: codeFor('sms', '+94 71 234 5678') });
  assert.deepEqual([phone.status, phone.body.data.nextStep], [200, 'business_details']);

  const business = await post('/business', { registrationToken: token, businessName: 'POS CAFE', address: 'Jaffna' });
  assert.deepEqual([business.status, business.body.data.nextStep], [200, 'access_key']);
  assert.ok(!business.text.includes(keyFor('owner@poscafe.com')), 'the access key is not in the API response');

  // Nobody can sign in before activation.
  const early = await post('/../login', { email: 'owner@poscafe.com', password: DEFAULT_PASSWORD });
  assert.equal(early.status, 401);

  const activated = await post('/activate', { email: 'owner@poscafe.com', accessKey: keyFor('owner@poscafe.com') });
  assert.deepEqual([activated.status, activated.body.data], [200, { activated: true }]);

  const session = await api('POST', '/api/v1/auth/login', { json: { email: 'owner@poscafe.com', password: DEFAULT_PASSWORD } });
  assert.equal(session.status, 200);
  const { token: access, user } = session.body.data;
  assert.equal(user.role, 'Owner');
  assert.equal(user.firstName, 'Michel');
  assert.equal(user.lastName, 'Parede');

  const me = await api('GET', '/api/v1/auth/me', { headers: { authorization: `Bearer ${access}` } });
  assert.deepEqual(me.body.data.shops.map((x) => x.name), ['POS CAFE']);
  assert.deepEqual(ctx.settings.shops.map((x) => [x.accountId, x.ownerId, x.body.name, x.body.address, x.body.phone]), [[user.accountId, user.id, 'POS CAFE', 'Jaffna', '+94 71 234 5678']], 'the first shop is created in the Settings Service');

  const row = store.adminProfiles.get(user.id);
  assert.deepEqual([row.role, row.status, row.accountId], ['owner', 'active', user.accountId]);
  assert.ok(row.emailVerifiedAt && row.phoneVerifiedAt, 'verification times come from the real checks');
  assert.equal(await verifyPassword(DEFAULT_PASSWORD, row.passwordHash), true, 'the signup password became the login password');
});

test('steps must be done in order; skipping is refused with the step to do', async () => {
  const token = await start();
  const skipOwner = await post('/owner', { registrationToken: token, ownerName: 'M', phone: '0712345678' });
  assert.equal(skipOwner.status, 409);
  assert.equal(skipOwner.body.code, 'WRONG_STEP');
  assert.match(skipOwner.body.errors[0].message, /email_verification/);
  assert.equal((await post('/phone/verify', { registrationToken: token, code: '123456' })).status, 409);
  assert.equal((await post('/business', { registrationToken: token, businessName: 'B', address: 'A' })).status, 409);
  assert.equal((await post('/activate', { email: 'owner@poscafe.com', accessKey: 'ABCD-EFGH-JKLM-NPQR' })).status, 400, 'no key exists yet');
  assert.equal((await api('POST', '/api/v1/auth/login', { json: { email: 'owner@poscafe.com', password: DEFAULT_PASSWORD } })).status, 401);
  assert.equal(store.adminProfiles.size, 0, 'no user exists before activation');

  const owner = await toOwnerStep({ email: 'two@poscafe.com' });
  assert.equal((await post('/email/verify', { registrationToken: owner, code: '123456' })).status, 409, 'a finished step can not be repeated');
  assert.equal((await post('/business', { registrationToken: owner, businessName: 'B', address: 'A' })).status, 409);
});

test('field validation, including the server-side password rule', async () => {
  const bad = async (over, field) => {
    store.rateLimits.clear(); // this test sends many requests; the rate limit has its own test
    const res = await post('/credentials', { ...PERSON, ...over });
    assert.equal(res.status, 400, JSON.stringify(over));
    assert.ok(res.body.errors.some((e) => e.field === field), `${JSON.stringify(over)} -> ${JSON.stringify(res.body.errors)}`);
    return res;
  };
  await bad({ email: 'nope' }, 'email');
  await bad({ username: '' }, 'username');
  await bad({ username: 'x'.repeat(51) }, 'username');
  await bad({ acceptTerms: false }, 'acceptTerms');
  await bad({ acceptTerms: 'true' }, 'acceptTerms');
  for (const password of ['Sh0rt!A', 'alllowercase1!', 'ALLUPPERCASE1!', 'NoNumbers!!', 'NoSymbols123', 'Has Space1!', '', 'x'.repeat(129)]) {
    const res = await bad({ password }, 'password');
    assert.ok(!res.text.includes(password) || password === '', 'the password is never echoed');
  }
  assert.equal((await bad({ password: 'weak' }, 'password')).body.errors.find((e) => e.field === 'password').message, RULE_TEXT);
  assert.equal(store.registrations.size, 0);

  const token = await toOwnerStep();
  const owner = (over) => post('/owner', { registrationToken: token, ownerName: 'Michel', phone: '0712345678', ...over });
  assert.equal((await owner({ ownerName: '' })).status, 400);
  for (const phone of ['12ab', '123', '+', '1234567890123456', 5]) assert.equal((await owner({ phone })).status, 400, String(phone));
  assert.equal((await post('/business', { registrationToken: 'x'.repeat(30), businessName: '', address: 'A' })).status, 400);
  assert.equal((await post('/email/verify', { registrationToken: token, code: '12345' })).status, 400);
  assert.equal((await post('/email/verify', { registrationToken: 'short', code: '123456' })).status, 400);
  assert.equal((await post('/email/verify', [])).status, 400);
});

test('an unknown or expired registration token is refused', async () => {
  assert.equal((await post('/email/verify', { registrationToken: 'a'.repeat(43), code: '123456' })).body.code, 'INVALID_REGISTRATION');
  const token = await start();
  clock.advance(24 * 3600 * 1000 + 1000);
  const res = await post('/email/verify', { registrationToken: token, code: codeFor('email', 'owner@poscafe.com') });
  assert.deepEqual([res.status, res.body.code], [400, 'INVALID_REGISTRATION']);
});

test('duplicate email and phone are refused; an unfinished signup is replaced', async () => {
  await createUser({ id: 1, email: 'taken@poscafe.com', phone: '+94 77 111 2222' });
  const dup = await post('/credentials', { ...PERSON, email: 'TAKEN@poscafe.com' });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.errors[0].field, 'email');

  const first = await start();
  const second = await start(); // same email again: the earlier unfinished signup is replaced
  assert.equal(store.registrations.size, 1);
  assert.equal((await post('/email/verify', { registrationToken: first, code: codeFor('email', 'owner@poscafe.com') })).body.code, 'INVALID_REGISTRATION');
  assert.equal((await post('/email/verify', { registrationToken: second, code: codeFor('email', 'owner@poscafe.com') })).status, 200);

  const samePhone = await post('/owner', { registrationToken: second, ownerName: 'M', phone: '0094771112222' }); // different spelling, same number? only identical normalised numbers clash
  assert.equal(samePhone.status, 200);
  const clash = await post('/owner', { registrationToken: second, ownerName: 'M', phone: '+94 77 111 2222' });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.errors[0].field, 'phone');
});

test('activation re-checks that the email and phone are still free', async () => {
  await toActivation();
  await createUser({ id: 5, email: 'owner@poscafe.com' }); // someone else took the email in the meantime
  const res = await post('/activate', { email: 'owner@poscafe.com', accessKey: keyFor('owner@poscafe.com') });
  assert.equal(res.status, 409);
  assert.equal(ctx.settings.shops.length, 0, 'nothing half-created');
});

test('activation fails cleanly (503, no user left behind) while the Settings Service is down, and can be retried', async () => {
  await toActivation();
  const key = keyFor('owner@poscafe.com');
  ctx.settings.fail();
  const down = await post('/activate', { email: 'owner@poscafe.com', accessKey: key });
  assert.deepEqual([down.status, down.body.code], [503, 'SERVICE_UNAVAILABLE']);
  assert.equal(store.adminProfiles.size, 0, 'the owner was removed again, so nothing is half-created');
  assert.equal((await api('POST', '/api/v1/auth/login', { json: { email: 'owner@poscafe.com', password: DEFAULT_PASSWORD } })).status, 401);
  ctx.settings.fail(false);
  const retry = await post('/activate', { email: 'owner@poscafe.com', accessKey: key });
  assert.deepEqual([retry.status, retry.body.data], [200, { activated: true }], 'the access key was not used up by the failed attempt');
  assert.equal(ctx.settings.shops.length, 1);
  assert.equal(store.adminProfiles.size, 1);
});

// ---------- one-time codes ----------
test('verification codes: wrong guesses, lock-out, resend limits, expiry and reuse', async () => {
  const token = await start();
  const code = codeFor('email', 'owner@poscafe.com');
  const verify = (c) => post('/email/verify', { registrationToken: token, code: c });

  const bad = await verify(wrong(code));
  assert.deepEqual([bad.status, bad.body.code, bad.body.errors[0].message], [400, 'INVALID_CODE', 'invalid']);
  assert.ok(!bad.text.includes(code));
  for (let i = 0; i < 4; i += 1) await verify(wrong(code));
  const locked = await verify(code); // five wrong guesses used up: even the right code is refused
  assert.equal(locked.status, 400);
  assert.equal(locked.body.errors[0].message, 'locked');

  const tooSoon = await post('/email/resend', { registrationToken: token });
  assert.equal(tooSoon.status, 429);
  assert.ok(Number(tooSoon.headers.get('retry-after')) > 0);
  clock.advance(61 * 1000);
  const resent = await post('/email/resend', { registrationToken: token });
  assert.equal(resent.status, 200);
  const fresh = codeFor('email', 'owner@poscafe.com');
  assert.equal((await verify(code === fresh ? wrong(code) : code)).status, 400, 'the old code no longer works');

  clock.advance(3 * 60 * 1000 + 1000);
  const expired = await verify(fresh);
  assert.equal(expired.body.errors[0].message, 'expired');
  clock.advance(61 * 1000);
  await post('/email/resend', { registrationToken: token });
  const ok = await verify(codeFor('email', 'owner@poscafe.com'));
  assert.equal(ok.status, 200);
  const reuse = await verify(codeFor('email', 'owner@poscafe.com')); // the step is finished and the code is spent
  assert.equal(reuse.status, 409);
});

test('verification codes: at most five per hour', async () => {
  const token = await start();
  for (let i = 0; i < 4; i += 1) {
    clock.advance(61 * 1000);
    assert.equal((await post('/email/resend', { registrationToken: token })).status, 200);
  }
  clock.advance(61 * 1000);
  const capped = await post('/email/resend', { registrationToken: token });
  assert.equal(capped.status, 429);
  assert.ok(Number(capped.headers.get('retry-after')) > 60);
});

test('phone verification mirrors email verification, and a wrong phone can be corrected', async () => {
  const token = await toPhoneStep('0712345678');
  assert.equal(store.outbox.filter((m) => m.channel === 'sms').length, 1);
  clock.advance(61 * 1000);
  const fix = await post('/owner', { registrationToken: token, ownerName: 'Michel', phone: '0723456789' });
  assert.equal(fix.status, 200);
  assert.equal(lastMessage('sms', '0723456789').to, '0723456789');
  const old = await post('/phone/verify', { registrationToken: token, code: codeFor('sms', '0712345678') });
  assert.equal(old.status, 400, 'the code sent to the old number does not work');
  assert.equal((await post('/phone/verify', { registrationToken: token, code: codeFor('sms', '0723456789') })).status, 200);
});

// ---------- access key ----------
test('access key: single use, wrong keys, lock-out, resend, expiry and the same answer for unknown emails', async () => {
  await toActivation();
  const key = keyFor('owner@poscafe.com');
  const activate = (accessKey, email = 'owner@poscafe.com') => post('/activate', { email, accessKey });

  const wrongKey = await activate('ABCD-EFGH-JKLM-NPQR');
  const unknown = await activate('ABCD-EFGH-JKLM-NPQR', 'nobody@poscafe.com');
  assert.deepEqual([wrongKey.status, wrongKey.body.code], [400, 'INVALID_ACCESS_KEY']);
  assert.deepEqual(unknown.body, wrongKey.body, 'an unknown email looks exactly like a wrong key');
  assert.equal((await activate('888888')).status, 400);
  assert.equal(store.registrations.get(1).accessKeyAttempts, 1, 'only a well-formed wrong key counts as an attempt');
  for (let i = 0; i < 4; i += 1) await activate('ABCD-EFGH-JKLM-NPQR'); // five wrong attempts in total
  assert.equal((await activate(key)).status, 400, 'the key is locked after five wrong attempts');

  const sameAnswer = await post('/access-key/resend', { email: 'nobody@poscafe.com' });
  clock.advance(61 * 1000);
  const resend = await post('/access-key/resend', { email: 'owner@poscafe.com' });
  assert.deepEqual(resend.body, sameAnswer.body, 'the resend answer does not reveal whether a signup exists');
  const fresh = keyFor('owner@poscafe.com');
  assert.notEqual(fresh, key);
  assert.equal((await activate(key)).status, 400, 'the old key is dead');
  assert.equal((await activate(fresh.toLowerCase().replace(/-/g, ' '))).status, 200, 'case, spaces and dashes do not matter');
  assert.equal((await activate(fresh)).status, 400, 'a key works only once');
  assert.equal((await post('/access-key/resend', { email: 'owner@poscafe.com' })).status, 200);
  assert.equal(store.outbox.filter((m) => m.subject === 'Your PAI POS access key').length, 2, 'no key was sent after activation');
});

test('access key: expires after 72 hours', async () => {
  await toActivation();
  const key = keyFor('owner@poscafe.com');
  clock.advance(72 * 3600 * 1000 + 1000);
  assert.equal((await post('/activate', { email: 'owner@poscafe.com', accessKey: key })).status, 400);
  clock.advance(61 * 1000);
  await post('/access-key/resend', { email: 'owner@poscafe.com' });
  assert.equal((await post('/activate', { email: 'owner@poscafe.com', accessKey: keyFor('owner@poscafe.com') })).status, 200);
});

test('access key: validation and rate limiting', async () => {
  assert.equal((await post('/activate', { email: 'nope', accessKey: 'ABCD-EFGH-JKLM-NPQR' })).status, 400);
  assert.equal((await post('/activate', { email: 'a@b.co' })).status, 400);
  assert.equal((await post('/activate', { email: 'a@b.co', accessKey: 'short' })).status, 400);
  for (let i = 0; i < 10; i += 1) await post('/activate', { email: 'a@b.co', accessKey: 'ABCD-EFGH-JKLM-NPQR' });
  const blocked = await post('/activate', { email: 'a@b.co', accessKey: 'ABCD-EFGH-JKLM-NPQR' });
  assert.equal(blocked.status, 429);
});

test('signup creation is rate limited per IP', async () => {
  for (let i = 0; i < 10; i += 1) await post('/credentials', { ...PERSON, email: `p${i}@poscafe.com` });
  assert.equal((await post('/credentials', { ...PERSON, email: 'p11@poscafe.com' })).status, 429);
});

// ---------- secrets at rest ----------
test('registration rows and code tables hold no plain password, token, code or key', async () => {
  const token = await toActivation();
  const email = 'owner@poscafe.com';
  const secrets = [DEFAULT_PASSWORD, token, codeFor('email', email), codeFor('sms', '0712345678'), keyFor(email), keyFor(email).replace(/-/g, '')];
  const stored = JSON.stringify([...store.registrations.values(), ...store.otps.values()]);
  for (const secret of secrets) assert.ok(!stored.includes(secret), `stored in plain: ${secret.slice(0, 3)}...`);
  const reg = [...store.registrations.values()][0];
  assert.match(reg.passwordHash, /^scrypt\$/);
  assert.match(reg.accessKeyHash, /^[0-9a-f]{64}$/);

  await post('/activate', { email, accessKey: keyFor(email) });
  const done = [...store.registrations.values()][0];
  assert.deepEqual([done.status, done.passwordHash, done.accessKeyHash, done.tokenHash], ['activated', null, null, null], 'secrets are wiped once activated');
});
