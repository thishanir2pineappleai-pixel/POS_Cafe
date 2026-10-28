// The SMTP client (services/integration/smtpTransport.js) against a stand-in SMTP server on loopback (shared/testing/fakeSmtpServer.js).
// No real email is ever sent. The TLS cases need the `openssl` program to make a throw-away certificate; without it they are
// reported as SKIPPED with the reason, never as passed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { sendMail, SmtpError, buildMessage, assertSafeAddress, dotStuff } = require('../../services/integration/smtpTransport');
const { startFakeSmtpServer, makeTlsMaterial } = require('@pos-cafe/shared/testing/fakeSmtpServer');

const PASSWORD = 'Sup3r-Secret-Pa55';
const CREDENTIALS = { user: 'sender@example.com', password: PASSWORD };
const MESSAGE = { to: 'new.owner@example.com', subject: 'Your PAI POS verification code', text: 'Your PAI POS verification code is 482913. It expires in 3 minutes.' };
let tlsMaterial = null;
const servers = [];
before(() => { tlsMaterial = makeTlsMaterial(); });
after(async () => { for (const s of servers) await s.stop(); });
const skipTls = () => (tlsMaterial ? false : 'openssl is not available: the TLS paths were NOT tested');
const start = async (options) => { const s = await startFakeSmtpServer({ tlsMaterial, ...options }); servers.push(s); return s; };
const base = (smtp, over = {}) => ({ host: smtp.host, port: smtp.port, tls: 'starttls-optional', from: 'sender@example.com', fromName: 'PAI POS', timeoutMs: 4000, ...over });
const failsWith = async (promise, category, code) => {
  const err = await promise.then(() => null, (e) => e);
  assert.ok(err instanceof SmtpError, `expected an SmtpError, got ${err}`);
  assert.equal(err.category, category);
  if (code !== undefined) assert.equal(err.smtpCode, code);
  return err;
};

test('plain local server: the message arrives with the right envelope, headers and decoded body', async () => {
  const smtp = await start({ mode: 'plain' });
  await sendMail(base(smtp), MESSAGE);
  assert.equal(smtp.messages.length, 1);
  const [m] = smtp.messages;
  assert.deepEqual([m.from, m.to], ['sender@example.com', ['new.owner@example.com']]);
  assert.equal(m.text, MESSAGE.text, 'the body is delivered intact (base64 on the wire)');
  assert.equal(m.headers.subject, MESSAGE.subject);
  assert.equal(m.headers.from, '"PAI POS" <sender@example.com>');
  assert.equal(m.headers.to, '<new.owner@example.com>');
  assert.match(m.headers['message-id'], /^<[0-9a-f]{32}@example\.com>$/);
  assert.equal(m.headers['content-type'], 'text/plain; charset=UTF-8');
});

test('AUTH PLAIN: correct credentials are accepted and the message is sent after signing in', async () => {
  const smtp = await start({ mode: 'plain', auth: CREDENTIALS, mechanisms: ['PLAIN'] });
  await sendMail(base(smtp, CREDENTIALS), MESSAGE);
  assert.equal(smtp.messages.length, 1);
  assert.ok(smtp.events.findIndex((e) => e.command === 'AUTH') < smtp.events.findIndex((e) => e.command === 'MAIL'), 'AUTH came before MAIL FROM');
});

test('AUTH LOGIN is used when the server offers nothing else', async () => {
  const smtp = await start({ mode: 'plain', auth: CREDENTIALS, mechanisms: ['LOGIN'] });
  await sendMail(base(smtp, CREDENTIALS), MESSAGE);
  assert.equal(smtp.messages.length, 1);
});

test('wrong password: smtp category auth_failed (535), nothing is sent, and the error does not contain the password', async () => {
  const smtp = await start({ mode: 'plain', auth: CREDENTIALS });
  const err = await failsWith(sendMail(base(smtp, { user: CREDENTIALS.user, password: 'not-the-password' }), MESSAGE), 'auth_failed', 535);
  assert.equal(smtp.messages.length, 0);
  assert.ok(!JSON.stringify([err.message, err.category, err.stack]).includes('not-the-password'), 'no secret in the error');
});

test('credentials are configured but the server offers no sign-in method: auth_unsupported, nothing sent', async () => {
  const smtp = await start({ mode: 'plain' }); // advertises no AUTH
  await failsWith(sendMail(base(smtp, CREDENTIALS), MESSAGE), 'auth_unsupported');
  assert.equal(smtp.messages.length, 0);
  assert.ok(!smtp.events.some((e) => e.command === 'AUTH'), 'the credentials were never sent');
});

test('recipient refused (550): recipient_rejected, no message stored', async () => {
  const smtp = await start({ mode: 'plain', rejectRecipient: 550 });
  await failsWith(sendMail(base(smtp), MESSAGE), 'recipient_rejected', 550);
  assert.equal(smtp.messages.length, 0);
});

test('sender refused (553): sender_rejected', async () => {
  const smtp = await start({ mode: 'plain', rejectSender: 553 });
  await failsWith(sendMail(base(smtp), MESSAGE), 'sender_rejected', 553);
});

test('a temporary refusal (4xx) is reported as temporary', async () => {
  const smtp = await start({ mode: 'plain', rejectRecipient: 451 });
  await failsWith(sendMail(base(smtp), MESSAGE), 'temporary', 451);
});

test('STARTTLS: the connection is upgraded, the certificate verified, and the credentials travel only after the upgrade', { skip: skipTls() }, async () => {
  const smtp = await start({ mode: 'starttls', auth: CREDENTIALS });
  await sendMail(base(smtp, { ...CREDENTIALS, tls: 'starttls-required', host: 'localhost', ca: tlsMaterial.cert }), MESSAGE);
  assert.equal(smtp.messages.length, 1);
  assert.equal(smtp.messages[0].secure, true, 'the message came in over TLS');
  const auth = smtp.events.filter((e) => e.command === 'AUTH');
  assert.ok(auth.length === 1 && auth.every((e) => e.secure), 'AUTH was only ever seen on the encrypted connection');
  assert.ok(smtp.events.filter((e) => e.command === 'EHLO').length === 2, 'EHLO is repeated after STARTTLS');
});

test('implicit TLS (port 465 style) works with a verified certificate', { skip: skipTls() }, async () => {
  const smtp = await start({ mode: 'implicit', auth: CREDENTIALS });
  await sendMail(base(smtp, { ...CREDENTIALS, tls: 'implicit', host: 'localhost', ca: tlsMaterial.cert }), MESSAGE);
  assert.equal(smtp.messages.length, 1);
  assert.ok(smtp.events.every((e) => e.secure), 'everything was encrypted');
});

test('an untrusted certificate is refused (tls) and nothing is sent: there is no way to skip verification', { skip: skipTls() }, async () => {
  const smtp = await start({ mode: 'implicit', auth: CREDENTIALS });
  // No `ca` is given, so the throw-away certificate is not trusted.
  await failsWith(sendMail(base(smtp, { ...CREDENTIALS, tls: 'implicit', host: 'localhost' }), MESSAGE), 'tls');
  assert.equal(smtp.messages.length, 0);
  assert.equal(smtp.events.length, 0, 'not even EHLO was sent to an unverified server');
});

test('a certificate issued for ANOTHER host name is refused even though it is trusted (tls)', { skip: skipTls() }, async () => {
  const other = makeTlsMaterial('DNS:mail.other-company.example');
  const smtp = await startFakeSmtpServer({ mode: 'implicit', tlsMaterial: other });
  servers.push(smtp);
  // `other.cert` is trusted here, but it does not name "localhost", so the host-name check must fail.
  await failsWith(sendMail(base(smtp, { tls: 'implicit', host: 'localhost', ca: other.cert }), MESSAGE), 'tls');
  assert.equal(smtp.messages.length, 0);
});

test('STARTTLS is REQUIRED by default off the local machine: a server without it gets no credentials and no message', async () => {
  const smtp = await start({ mode: 'plain', auth: CREDENTIALS, authOnlyAfterTls: false });
  await failsWith(sendMail(base(smtp, { ...CREDENTIALS, tls: 'starttls-required' }), MESSAGE), 'tls_required');
  assert.ok(!smtp.events.some((e) => e.command === 'AUTH' || e.command === 'MAIL'), 'neither AUTH nor MAIL FROM was sent');
  assert.equal(smtp.messages.length, 0);
});

test('a server that never answers: timeout within the limit', async () => {
  const smtp = await start({ silent: true });
  const started = Date.now();
  await failsWith(sendMail(base(smtp, { timeoutMs: 300 }), MESSAGE), 'timeout');
  assert.ok(Date.now() - started < 2000, 'gave up quickly');
});

test('nothing is listening: connection', async () => {
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const { port } = probe.address();
  await new Promise((r) => probe.close(r)); // the port is now closed
  await failsWith(sendMail({ host: '127.0.0.1', port, tls: 'starttls-optional', from: 'sender@example.com', timeoutMs: 2000 }, MESSAGE), 'connection');
});

test('an address that could inject commands or headers is refused BEFORE any connection is made', async () => {
  const smtp = await start({ mode: 'plain' });
  for (const bad of ['a@b.com>\r\nRCPT TO:<evil@x.com', 'a b@c.com', 'a@b.com,c@d.com', 'a"@b.com', '<a@b.com>', 'no-at-sign', 'x@y.com\nBcc: z@y.com', '']) {
    await failsWith(sendMail(base(smtp), { ...MESSAGE, to: bad }), 'invalid_address');
  }
  assert.equal(smtp.events.length, 0, 'the server saw no connection at all');
  assert.equal(assertSafeAddress('plain+tag@example.com'), 'plain+tag@example.com', 'ordinary addresses, including +tags, pass');
  assert.throws(() => assertSafeAddress('no-at-sign'), (e) => e.category === 'invalid_address');
});

test('dot-stuffing: a line that starts with a dot is doubled so it can never end the message early', () => {
  assert.equal(dotStuff('a\r\n.b\r\n..c\r\n.'), 'a\r\n..b\r\n...c\r\n..');
});

test('message building: non-ASCII subject and sender name are encoded, header injection through them is impossible, dots are safe', () => {
  const raw = buildMessage({ from: 'no-reply@example.com', fromName: 'Café\r\nBcc: evil@x.com', to: 'a@b.com', subject: 'Código\r\nX-Evil: 1', text: '.leading dot\n..two dots\n' });
  const [head, body] = raw.split('\r\n\r\n');
  assert.ok(!/^Bcc:/mi.test(head) && !/^X-Evil:/mi.test(head), 'no injected header');
  assert.match(head, /^Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/m);
  assert.match(head, /^From: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <no-reply@example\.com>$/m);
  assert.equal(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8'), '.leading dot\n..two dots\n', 'the body survives exactly');
  assert.ok(body.split('\r\n').every((l) => l.length <= 76), 'lines are at most 76 characters');
});

test('a body with a lone "." line is delivered whole (the body travels as base64, and dot-stuffing backs it up)', async () => {
  const smtp = await start({ mode: 'plain' });
  await sendMail(base(smtp), { ...MESSAGE, text: 'line one\r\n.\r\nline after a lone dot' });
  assert.equal(smtp.messages.length, 1);
  assert.equal(smtp.messages[0].text, 'line one\r\n.\r\nline after a lone dot');
});
