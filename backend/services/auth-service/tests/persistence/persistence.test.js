// Restart persistence: the Auth Service runs as a REAL process on MySQL (Prisma). Everything that must survive a restart is
// created through the HTTP API, the process is stopped and started again, and it must all still work: a signed-in session
// (the OLD token), the password, admins, a signup that is half finished (including its pending one-time code), and a
// logout. Needs AUTH_TEST_DATABASE_URL (a database whose name ends in _test, already migrated). Without it the tests are
// SKIPPED and say so. The Settings Service is a stand-in (the Auth Service asks it for the first shop).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { testDatabase } = require('@pos-cafe/shared/testing/database');
const { startFakeSettingsService } = require('@pos-cafe/shared/testing/fakeSettingsService');
const { startServiceProcess, freePort } = require('@pos-cafe/shared/testing/serviceProcess');

const db = testDatabase('AUTH_TEST_DATABASE_URL');
const SERVICE_DIR = path.resolve(__dirname, '../..');
const skip = db ? false : 'AUTH_TEST_DATABASE_URL is not set: persistence was NOT tested';
const PASSWORD = 'Abc@1234';
const internalKey = crypto.randomBytes(24).toString('hex');
const jwtSecret = crypto.randomBytes(24).toString('hex');

let port; let service; let prisma; let settings; let uploads;
const start = () => startServiceProcess({
  serviceDir: SERVICE_DIR,
  port,
  env: {
    REPOSITORY_DRIVER: 'prisma', AUTH_DATABASE_URL: db.url, AUTH_SERVICE_PORT: String(port), HOST: '127.0.0.1', MESSAGE_DELIVERY: 'dev-outbox',
    JWT_SECRET: jwtSecret, INTERNAL_SERVICE_KEY: internalKey, SETTINGS_SERVICE_URL: settings.url, UPLOADS_DIR: uploads,
  },
});
const call = async (method, url, { json, token, headers = {} } = {}) => {
  const res = await fetch(service.url + url, { method, headers: { ...(json ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: json ? JSON.stringify(json) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const post = (p, json) => call('POST', `/api/v1/auth/signup${p}`, { json });
const outbox = async () => (await call('GET', '/api/v1/dev/outbox')).body.data;
const codeFor = async (channel, to) => [...await outbox()].reverse().find((m) => m.channel === channel && m.to === to && /\b\d{6}\b/.test(m.text)).text.match(/\b(\d{6})\b/)[1];
const keyFor = async (to) => [...await outbox()].reverse().find((m) => m.to === to && /[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}/.test(m.text)).text.match(/[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}/)[0];
const wipe = async () => {
  await prisma.oneTimeCode.deleteMany();
  await prisma.registration.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.account.deleteMany();
};
const restart = async () => {
  await service.stop();
  await assert.rejects(fetch(`${service.url}/health`, { signal: AbortSignal.timeout(1000) }), 'the service is down');
  service = await start(); // a brand new process: nothing is in its memory
};

before(async () => {
  if (!db) return;
  port = await freePort();
  uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-auth-persist-'));
  settings = await startFakeSettingsService({ internalKey });
  process.env.REPOSITORY_DRIVER = 'prisma';
  process.env.AUTH_DATABASE_URL = db.url;
  ({ prisma } = require('../../repositories/prisma/client'));
  await wipe();
  service = await start();
});
after(async () => {
  if (!db) return;
  await service?.stop();
  await wipe();
  await prisma.$disconnect();
  await settings.stop();
  fs.rmSync(uploads, { recursive: true, force: true });
});

test('a full signup, a signed-in session, admins and a logout all survive a restart; a half-finished signup continues after it', { skip }, async () => {
  const owner = 'owner@poscafe.com';
  const phone = '+94 71 234 5678';
  const t = (await post('/credentials', { email: owner, username: 'Owner', password: PASSWORD, acceptTerms: true })).body.data.registrationToken;
  assert.equal((await post('/email/verify', { registrationToken: t, code: await codeFor('email', owner) })).status, 200);
  assert.equal((await post('/owner', { registrationToken: t, ownerName: 'Michel Parede', phone })).status, 200);
  assert.equal((await post('/phone/verify', { registrationToken: t, code: await codeFor('sms', phone) })).status, 200);
  assert.equal((await post('/business', { registrationToken: t, businessName: 'POS CAFE', address: 'Jaffna' })).status, 200);
  assert.equal((await post('/activate', { email: owner, accessKey: await keyFor(owner) })).status, 200);
  assert.equal(settings.shops.length, 1, 'the first shop was created in the Settings Service');

  const login = await call('POST', '/api/v1/auth/login', { json: { email: owner, password: PASSWORD } });
  assert.equal(login.status, 200);
  const token = login.body.data.token;
  const admin = await call('POST', '/api/v1/settings/admins', { token, json: { firstName: 'Sam', lastName: 'Lee', phone: '0712223333', email: 'sam@poscafe.com', password: 'Zzz#9999' } });
  assert.equal(admin.status, 201, JSON.stringify(admin.body));
  const samLogin = await call('POST', '/api/v1/auth/login', { json: { email: 'sam@poscafe.com', password: 'Zzz#9999' } });
  const loggedOut = samLogin.body.data.token;
  assert.equal((await call('POST', '/api/v1/auth/logout', { token: loggedOut })).status, 200);

  // a second signup that stops half way: step 1 done, email code issued but NOT yet entered
  const pending = 'pending@poscafe.com';
  const pt = (await post('/credentials', { email: pending, username: 'Pending', password: PASSWORD, acceptTerms: true })).body.data.registrationToken;
  const pendingCode = await codeFor('email', pending);

  await restart();

  // the OLD tokens: the session survived, so the owner is still signed in; the logged-out one is still refused
  const me = await call('GET', '/api/v1/auth/me', { token });
  assert.equal(me.status, 200, JSON.stringify(me.body));
  assert.deepEqual([me.body.data.email, me.body.data.role, me.body.data.firstName, me.body.data.lastName], [owner, 'Owner', 'Michel', 'Parede']);
  assert.equal((await call('GET', '/api/v1/auth/me', { token: loggedOut })).status, 401, 'a logout is still in force after a restart');
  const verify = await call('POST', '/internal/sessions/verify', { json: { sessionId: JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sid, userId: me.body.data.id }, headers: { 'x-internal-key': internalKey } });
  assert.equal(verify.body.data.active, true, 'other services still get an active session from the Auth Service');

  // passwords and admins
  assert.equal((await call('POST', '/api/v1/auth/login', { json: { email: owner, password: PASSWORD } })).status, 200);
  assert.equal((await call('POST', '/api/v1/auth/login', { json: { email: owner, password: 'Wrong@1234' } })).status, 401);
  assert.deepEqual((await call('GET', '/api/v1/settings/admins', { token })).body.data.map((a) => [a.firstName, a.role]), [['Sam', 'Admin'], ['Michel', 'Owner']]);
  assert.equal((await call('POST', '/api/v1/settings/admins', { token, json: { firstName: 'X', lastName: 'Y', phone: '0711', email: 'SAM@poscafe.com', password: 'Abc@1234' } })).status, 409, 'duplicate emails are still refused');

  // the half-finished signup continues with the code that was issued BEFORE the restart
  const wrong = await post('/email/verify', { registrationToken: pt, code: pendingCode === '000000' ? '111111' : '000000' });
  assert.equal(wrong.status, 400, 'a wrong code is refused');
  const ok = await post('/email/verify', { registrationToken: pt, code: pendingCode });
  assert.deepEqual([ok.status, ok.body.data.nextStep], [200, 'owner_details'], 'the registration and its code survived the restart');

  // a password reset is a second path that depends on stored codes and sessions
  assert.equal((await call('POST', '/api/v1/auth/forgot-password', { json: { email: owner } })).status, 200);
  const resetCode = await codeFor('email', owner);
  await restart();
  const verified = await call('POST', '/api/v1/auth/forgot-password/verify', { json: { email: owner, code: resetCode } });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  const reset = await call('POST', '/api/v1/auth/reset-password', { json: { resetToken: verified.body.data.resetToken, password: 'New@12345', confirmPassword: 'New@12345' } });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  await restart();
  assert.equal((await call('GET', '/api/v1/auth/me', { token })).status, 401, 'the reset ended every session, and that is stored too');
  assert.equal((await call('POST', '/api/v1/auth/login', { json: { email: owner, password: 'New@12345' } })).status, 200, 'the new password is stored');
  assert.equal((await call('POST', '/api/v1/auth/login', { json: { email: owner, password: PASSWORD } })).status, 401);
});

test('service output never contains the database password or the keys', { skip }, () => {
  const out = service.output();
  assert.match(out, /Auth Service listening/);
  for (const secret of [db.connection.password, jwtSecret, internalKey]) assert.ok(!out.includes(secret));
});
