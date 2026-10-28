// LOCAL DEVELOPMENT signup without SMS: MESSAGE_DELIVERY=smtp (email works) and DEV_SKIP_PHONE_VERIFICATION=true (no SMS provider exists).
// Proves the bypass skips ONLY the phone code, never the email code; that the phone number is stored as NOT verified and the API says
// "skipped" instead of pretending; and that the whole signup then works. The email transport is a stand-in: no real email is sent.
process.env.MESSAGE_DELIVERY = 'smtp';
process.env.DEV_SKIP_PHONE_VERIFICATION = 'true';
process.env.SMTP_HOST = 'smtp.test.invalid'; // never contacted
process.env.SMTP_PORT = '587';
process.env.SMTP_FROM = 'no-reply@example.com';
process.env.SMTP_USER = '';
process.env.SMTP_PASSWORD = '';

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { store } = require('../../repositories/memory/store');
const emailProvider = require('../../services/integration/emailProvider');
const { env } = require('../../config');
const { useTestServer, createUser, DEFAULT_PASSWORD } = require('./helpers');

// This file reads the IN-MEMORY store; on the MySQL repositories it would write to a real database, so refuse to run there.
if (env.repositoryDriver !== 'memory') throw new Error('signup-phone-bypass.test.js must run with REPOSITORY_DRIVER=memory (use pnpm test, which sets it)');

const { api } = useTestServer();
const A = '/api/v1/auth/signup';
const PERSON = { email: 'local.owner@example.com', username: 'Jhon', password: DEFAULT_PASSWORD, acceptTerms: true };
const post = (path, json) => api('POST', `${A}${path}`, { json });
let sent;
beforeEach(() => {
  sent = [];
  emailProvider.useTransport(async (options, message) => { sent.push(message); });
});
after(() => emailProvider.useTransport());
const lastCode = () => sent[sent.length - 1].text.match(/\b(\d{6})\b/)[1];
const lastKey = () => sent[sent.length - 1].text.match(/[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}/)[0];

async function toOwnerStep() {
  const token = (await post('/credentials', PERSON)).body.data.registrationToken;
  assert.equal((await post('/email/verify', { registrationToken: token, code: lastCode() })).status, 200);
  return token;
}

test('configuration: the bypass is on (it can only be on outside production), email goes by SMTP', () => {
  assert.equal(env.skipPhoneVerification, true);
  assert.equal(env.isProduction, false);
  assert.equal(env.messageDelivery, 'smtp');
});

test('the owner step skips the phone code, says so honestly, sends no SMS, and moves straight to the business step', async () => {
  const token = await toOwnerStep();
  const emails = sent.length;
  const owner = await post('/owner', { registrationToken: token, ownerName: 'Michel Parede', phone: '0712345678' });
  assert.equal(owner.status, 200, owner.text);
  assert.equal(owner.body.data.nextStep, 'business_details');
  assert.equal(owner.body.data.phoneVerification, 'skipped');
  assert.deepEqual(owner.body.data.delivery, { channel: 'sms', delivered: false, reason: 'phone_verification_skipped' });
  assert.equal(sent.length, emails, 'no message of any kind was sent for the phone');
  assert.ok(!/"verified"\s*:\s*true/.test(owner.text), 'the response never says anything was verified');
});

test('the skipped phone is recorded as NOT verified (phoneVerifiedAt stays empty) while the email IS verified', async () => {
  const token = await toOwnerStep();
  await post('/owner', { registrationToken: token, ownerName: 'Michel Parede', phone: '0712345678' });
  const reg = [...store.registrations.values()].find((r) => r.email === PERSON.email);
  assert.equal(reg.status, 'business_pending');
  assert.equal(reg.phoneVerifiedAt, null, 'not verified');
  assert.equal(typeof reg.emailVerifiedAt, 'number', 'the email was verified by a real code');
});

test('there is no phone code to enter: the phone verify/resend routes are the wrong step now', async () => {
  const token = await toOwnerStep();
  await post('/owner', { registrationToken: token, ownerName: 'Michel Parede', phone: '0712345678' });
  const verify = await post('/phone/verify', { registrationToken: token, code: '123456' });
  assert.equal(verify.status, 409);
  assert.equal(verify.body.code, 'WRONG_STEP');
  assert.equal((await post('/phone/resend', { registrationToken: token })).status, 409);
});

test('the bypass NEVER skips email verification: nothing after step 1 works until the emailed code is entered', async () => {
  const token = (await post('/credentials', PERSON)).body.data.registrationToken;
  const owner = await post('/owner', { registrationToken: token, ownerName: 'Michel Parede', phone: '0712345678' });
  assert.deepEqual([owner.status, owner.body.code], [409, 'WRONG_STEP'], 'owner details are refused before the email is verified');
  assert.equal((await post('/business', { registrationToken: token, businessName: 'POS CAFE', address: 'Jaffna' })).status, 409);
  assert.equal((await post('/email/verify', { registrationToken: token, code: '000000' })).status, 400, 'a wrong email code still fails');
  assert.equal((await post('/activate', { email: PERSON.email, accessKey: 'AAAA-BBBB-CCCC-DDDD' })).status, 400);
  assert.equal([...store.adminProfiles.values()].length, 0, 'no account exists');
});

test('a phone number that already belongs to an account is still refused', async () => {
  await createUser({ id: 1, email: 'existing@example.com', phone: '0712345678' });
  const token = await toOwnerStep();
  const owner = await post('/owner', { registrationToken: token, ownerName: 'Michel Parede', phone: '071 234 5678' }); // same number as the account, spaced differently
  assert.equal(owner.status, 409);
  assert.equal(owner.body.code, 'DUPLICATE');
});

test('the WHOLE local signup works: email code, owner, business, emailed access key, activation, then login', async () => {
  const token = await toOwnerStep();
  assert.equal((await post('/owner', { registrationToken: token, ownerName: 'Michel Parede', phone: '0712345678' })).status, 200);
  const business = await post('/business', { registrationToken: token, businessName: 'POS CAFE', address: 'Jaffna' });
  assert.deepEqual([business.status, business.body.data.nextStep, business.body.data.delivery], [200, 'access_key', { channel: 'email', delivered: true }]);
  assert.equal(sent[sent.length - 1].to, PERSON.email, 'the access key went to the typed address');
  const key = lastKey();
  assert.ok(!business.text.includes(key), 'the key is not in the response');

  const wrong = await post('/activate', { email: PERSON.email, accessKey: 'AAAA-BBBB-CCCC-DDDD' });
  assert.equal(wrong.status, 400);
  const activated = await post('/activate', { email: PERSON.email, accessKey: key });
  assert.deepEqual([activated.status, activated.body.data.activated], [200, true]);

  const user = [...store.adminProfiles.values()].find((u) => u.email === PERSON.email);
  assert.equal(user.role, 'owner');
  assert.equal(user.phoneVerifiedAt, null, 'the account honestly records that its phone was never verified');
  assert.equal(typeof user.emailVerifiedAt, 'number');

  const login = await api('POST', '/api/v1/auth/login', { json: { email: PERSON.email, password: DEFAULT_PASSWORD } });
  assert.equal(login.status, 200, login.text);
  assert.ok(login.body.data.token);
});
