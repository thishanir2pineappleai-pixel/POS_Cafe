// Email OTP delivery with MESSAGE_DELIVERY=smtp: the signup and password-reset emails go through the SMTP provider, the API answers
// honestly about delivery, SMS stays disabled, and nothing secret reaches a response or a log.
// NO REAL EMAIL IS SENT: the SMTP connection is replaced by a stand-in (emailProvider.useTransport), and one test drives the real
// SMTP client against a fake SMTP server on loopback.
process.env.MESSAGE_DELIVERY = 'smtp';
process.env.DEV_SKIP_PHONE_VERIFICATION = 'false';
process.env.SMTP_HOST = 'smtp.test.invalid'; // never contacted
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'sender@example.com';
process.env.SMTP_PASSWORD = 'Sup3r-Secret-Pa55';
process.env.SMTP_FROM = 'no-reply@example.com';
process.env.SMTP_SECURE = 'false';

const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { store } = require('../../repositories/memory/store');
const emailProvider = require('../../services/integration/emailProvider');
const smtpTransport = require('../../services/integration/smtpTransport');
const { startFakeSmtpServer } = require('@pos-cafe/shared/testing/fakeSmtpServer');
const { env } = require('../../config');
const clock = require('@pos-cafe/shared/clock');
const { useTestServer, createUser, DEFAULT_PASSWORD } = require('./helpers');

// The tests below read and write the IN-MEMORY store (store.registrations, createUser). If this file ever ran on the MySQL
// repositories it would write to a real database, so refuse to run at all in that case.
if (env.repositoryDriver !== 'memory') throw new Error('signup-email.test.js must run with REPOSITORY_DRIVER=memory (use pnpm test, which sets it)');

const { api } = useTestServer();
const A = '/api/v1/auth/signup';
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const PERSON = { email: 'new.owner@example.com', username: 'Jhon', password: DEFAULT_PASSWORD, acceptTerms: true };
const post = (path, json) => api('POST', `${A}${path}`, { json });
const codeIn = (text) => text.match(/\b(\d{6})\b/)[1];

// What the stand-in transport receives, in order. `behaviour` decides whether a send succeeds.
let sent;
let behaviour;
let warnings;
const realWarn = console.warn;
beforeEach(() => {
  sent = [];
  behaviour = () => {};
  warnings = [];
  console.warn = (...args) => { warnings.push(args.join(' ')); };
  emailProvider.useTransport(async (options, message) => { sent.push({ options, message }); return behaviour(options, message); });
});
after(() => { console.warn = realWarn; emailProvider.useTransport(); });

test('configuration: smtp mode is active, SMS has no provider, and email reports itself as configured', () => {
  assert.equal(env.messageDelivery, 'smtp');
  assert.equal(emailProvider.isConfigured(), true);
  assert.deepEqual([env.smtp.host, env.smtp.port, env.smtp.tls], ['smtp.test.invalid', 587, 'starttls-required']);
});

test('signup step 1 emails the code to the address that was typed, and the API says it was delivered', async () => {
  const res = await post('/credentials', PERSON);
  assert.equal(res.status, 201, res.text);
  assert.deepEqual(res.body.data.delivery, { channel: 'email', delivered: true });
  assert.equal(res.body.data.nextStep, 'email_verification');
  assert.equal(sent.length, 1, 'exactly one email');
  assert.equal(sent[0].message.to, 'new.owner@example.com');
  assert.equal(sent[0].message.subject, 'Your PAI POS verification code');
  assert.match(sent[0].message.text, /verification code is \d{6}\./);
  assert.equal(sent[0].options.password, SMTP_PASSWORD, 'the provider hands the configured SMTP settings to the transport');
});

test('the code is NOT in the API response and is NOT kept in the dev outbox; the outbox route does not exist in smtp mode', async () => {
  const res = await post('/credentials', PERSON);
  const code = codeIn(sent[0].message.text);
  assert.ok(!res.text.includes(code), 'no OTP in the response body');
  assert.ok(!res.text.includes(SMTP_PASSWORD) && !res.text.includes(DEFAULT_PASSWORD), 'no password in the response body');
  assert.deepEqual(store.outbox, [], 'nothing is captured in memory');
  assert.equal((await api('GET', '/api/v1/dev/outbox')).status, 404);
});

test('email OTP verification: a wrong code is refused, the emailed code moves the signup to the next step, and a used code is dead', async () => {
  const token = (await post('/credentials', PERSON)).body.data.registrationToken;
  const code = codeIn(sent[0].message.text);
  const wrong = await post('/email/verify', { registrationToken: token, code: code === '000000' ? '111111' : '000000' });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.body.code, 'INVALID_CODE');
  const right = await post('/email/verify', { registrationToken: token, code });
  assert.deepEqual([right.status, right.body.data.nextStep], [200, 'owner_details']);
  const again = await post('/email/verify', { registrationToken: token, code });
  assert.equal(again.status, 409, 'the step is done: the same code cannot be used again');
});

test('delivery FAILURE is reported honestly: delivered:false with a reason, never delivered:true, and the signup is still usable', async () => {
  behaviour = () => { throw new smtpTransport.SmtpError('auth_failed', 535); };
  const res = await post('/credentials', PERSON);
  assert.equal(res.status, 201);
  assert.deepEqual(res.body.data.delivery, { channel: 'email', delivered: false, reason: 'smtp_auth_failed' });
  assert.ok(res.body.data.registrationToken, 'the registration exists, so Resend can try again');
});

test('every failure category reaches the API as smtp_<category>, and an unexpected error is a lost connection that leaks nothing', async () => {
  for (const category of ['connection', 'timeout', 'tls', 'tls_required', 'recipient_rejected', 'sender_rejected', 'temporary', 'invalid_address']) {
    behaviour = () => { throw new smtpTransport.SmtpError(category, 451); };
    const res = await post('/credentials', { ...PERSON, email: `${category.replace('_', '')}@example.com` });
    assert.deepEqual(res.body.data.delivery, { channel: 'email', delivered: false, reason: `smtp_${category}` });
  }
  behaviour = () => { throw new Error(`boom ${SMTP_PASSWORD} secret-detail new.owner@example.com`); };
  const res = await post('/credentials', { ...PERSON, email: 'other@example.com' });
  assert.deepEqual(res.body.data.delivery, { channel: 'email', delivered: false, reason: 'smtp_connection' });
  assert.ok(!res.text.includes('secret-detail') && !res.text.includes(SMTP_PASSWORD));
});

test('LOGS: a failure logs only its category and reply code, never the code, the recipient, the message or the password', async () => {
  behaviour = () => { throw new smtpTransport.SmtpError('auth_failed', 535); };
  await post('/credentials', PERSON);
  const code = codeIn(sent[0].message.text);
  assert.deepEqual(warnings, ['[auth] email not sent: smtp_auth_failed (SMTP reply 535)']);
  const everything = warnings.join('\n');
  for (const secret of [code, PERSON.email, PERSON.password, SMTP_PASSWORD, 'verification code']) assert.ok(!everything.includes(secret), `the log must not contain "${secret}"`);
  behaviour = () => { throw new Error(`leak ${SMTP_PASSWORD} ${code}`); };
  warnings.length = 0;
  await post('/credentials', { ...PERSON, email: 'x@example.com' });
  assert.ok(!warnings.join('\n').includes(SMTP_PASSWORD), 'even an unexpected error text is not logged');
});

test('Resend after a failure: the next send works, delivered:true, and the NEW code is the one that verifies', async () => {
  behaviour = () => { throw new smtpTransport.SmtpError('timeout'); };
  const token = (await post('/credentials', PERSON)).body.data.registrationToken;
  behaviour = () => {};
  clock.advance(61 * 1000); // a new code may be requested one minute after the last (policy.otp.resendCooldownMs)
  const resend = await post('/email/resend', { registrationToken: token });
  assert.deepEqual(resend.body.data.delivery, { channel: 'email', delivered: true });
  const fresh = codeIn(sent[sent.length - 1].message.text);
  assert.equal((await post('/email/verify', { registrationToken: token, code: fresh })).status, 200);
});

test('SMS stays DISABLED in smtp mode: the phone step reports it, sends nothing anywhere, and a guessed code does not pass', async () => {
  const token = (await post('/credentials', PERSON)).body.data.registrationToken;
  assert.equal((await post('/email/verify', { registrationToken: token, code: codeIn(sent[0].message.text) })).status, 200);
  const emailsBefore = sent.length;
  const owner = await post('/owner', { registrationToken: token, ownerName: 'Michel Parede', phone: '0712345678' });
  assert.equal(owner.status, 200);
  assert.deepEqual(owner.body.data.delivery, { channel: 'sms', delivered: false, reason: 'not_configured' });
  assert.equal(owner.body.data.nextStep, 'phone_verification', 'without the bypass the phone step is still required');
  assert.equal(sent.length, emailsBefore, 'the SMS text was not sent through the email transport');
  assert.deepEqual(store.outbox, [], 'and not captured either');
  const guess = await post('/phone/verify', { registrationToken: token, code: '123456' });
  assert.equal(guess.status, 400, 'no phone code exists, so none can be right');
});

test('the access key is emailed too (and is not in the response)', async () => {
  // Reach the business step through the store, because without the bypass the phone step cannot be completed (no SMS provider).
  const token = (await post('/credentials', PERSON)).body.data.registrationToken;
  await post('/email/verify', { registrationToken: token, code: codeIn(sent[0].message.text) });
  const reg = [...store.registrations.values()].find((r) => r.email === PERSON.email);
  Object.assign(reg, { status: 'business_pending', ownerName: 'Michel Parede', phone: '0712345678', phoneNormalized: '0712345678' });
  const business = await post('/business', { registrationToken: token, businessName: 'POS CAFE', address: 'Jaffna' });
  assert.deepEqual(business.body.data.delivery, { channel: 'email', delivered: true });
  const mail = sent[sent.length - 1].message;
  assert.equal(mail.subject, 'Your PAI POS access key');
  const key = mail.text.match(/[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}/)[0];
  assert.ok(!business.text.includes(key), 'the access key is not in the API response');
});

test('password reset uses SMTP too: a known address gets the code, an unknown one gets nothing, and both answer identically', async () => {
  await createUser({ id: 1, email: 'owner@example.com' });
  const known = await api('POST', '/api/v1/auth/forgot-password', { json: { email: 'owner@example.com' } });
  const unknown = await api('POST', '/api/v1/auth/forgot-password', { json: { email: 'nobody@example.com' } });
  assert.deepEqual(known.body.data, { deliveryConfigured: true });
  assert.deepEqual(unknown.body.data, known.body.data, 'the answer does not reveal whether the account exists');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].message.to, 'owner@example.com');
  assert.equal(sent[0].message.subject, 'Your PAI POS password reset code');
  const verify = await api('POST', '/api/v1/auth/forgot-password/verify', { json: { email: 'owner@example.com', code: codeIn(sent[0].message.text) } });
  assert.equal(verify.status, 200);
});

test('END TO END over a real SMTP conversation: provider -> SMTP client -> fake SMTP server, with the configured credentials', async () => {
  const smtp = await startFakeSmtpServer({ mode: 'plain', auth: { user: process.env.SMTP_USER, password: SMTP_PASSWORD } });
  // Same real client; only the address is redirected from smtp.test.invalid to the fake server on this machine.
  emailProvider.useTransport((options, message) => smtpTransport.sendMail({ ...options, host: smtp.host, port: smtp.port, tls: 'starttls-optional' }, message));
  try {
    const res = await post('/credentials', PERSON);
    assert.deepEqual(res.body.data.delivery, { channel: 'email', delivered: true });
    assert.equal(smtp.messages.length, 1);
    assert.deepEqual([smtp.messages[0].from, smtp.messages[0].to], ['no-reply@example.com', ['new.owner@example.com']]);
    assert.equal(smtp.messages[0].headers.from, '"PAI POS" <no-reply@example.com>');
    const code = codeIn(smtp.messages[0].text);
    assert.equal((await post('/email/verify', { registrationToken: res.body.data.registrationToken, code })).status, 200, 'the code that arrived by SMTP verifies');
  } finally { await smtp.stop(); }
});

test('END TO END with the WRONG SMTP password: the API says delivered:false / smtp_auth_failed, and nothing is stored on the server', async () => {
  const smtp = await startFakeSmtpServer({ mode: 'plain', auth: { user: process.env.SMTP_USER, password: 'a-different-password' } });
  emailProvider.useTransport((options, message) => smtpTransport.sendMail({ ...options, host: smtp.host, port: smtp.port, tls: 'starttls-optional' }, message));
  try {
    const res = await post('/credentials', PERSON);
    assert.deepEqual(res.body.data.delivery, { channel: 'email', delivered: false, reason: 'smtp_auth_failed' });
    assert.equal(smtp.messages.length, 0);
    assert.ok(![res.text, ...warnings].join('\n').includes(SMTP_PASSWORD));
  } finally { await smtp.stop(); }
});

test('the real SMTP connection cannot be reached from the test runner (safety net): no stand-in installed -> nothing is sent', async () => {
  emailProvider.useTransport(); // the real transport
  const res = await post('/credentials', { ...PERSON, email: 'guard@example.com' });
  assert.deepEqual(res.body.data.delivery, { channel: 'email', delivered: false, reason: 'smtp_blocked_in_tests' });
});
