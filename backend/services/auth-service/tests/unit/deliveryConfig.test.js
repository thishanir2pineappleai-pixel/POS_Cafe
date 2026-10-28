// Start-up rules for message delivery: the SMTP settings, and the local-development-only phone bypass. The parse functions take the
// production flag as a parameter, and a few tests start the real configuration in a child process to prove that production refuses to start.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseDelivery, parseSmtp, parseSkipPhoneVerification } = require('../../config/env');

const PASSWORD = 'Sup3r-Secret-Pa55';
const GOOD = { SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '465', SMTP_USER: 'sender@example.com', SMTP_PASSWORD: PASSWORD, SMTP_FROM: 'sender@example.com' };
const errorOf = (fn) => { try { fn(); } catch (err) { return err; } return null; };

test('MESSAGE_DELIVERY accepts smtp; unknown values are refused; dev-outbox is refused in production, smtp is not', () => {
  assert.equal(parseDelivery('smtp', false), 'smtp');
  assert.equal(parseDelivery('smtp', true), 'smtp');
  assert.equal(parseDelivery(undefined, true), 'none');
  assert.throws(() => parseDelivery('sendgrid', false), /must be one of: none, dev-outbox, smtp/);
  assert.throws(() => parseDelivery('dev-outbox', true), /not allowed when NODE_ENV=production/);
});

test('no SMTP settings are read (or required) unless MESSAGE_DELIVERY=smtp', () => {
  assert.equal(parseSmtp({}, 'none'), null);
  assert.equal(parseSmtp(GOOD, 'dev-outbox'), null);
});

test('a complete SMTP configuration is parsed; port 465 means TLS, 587 means STARTTLS, and defaults are filled in', () => {
  const tls465 = parseSmtp(GOOD, 'smtp');
  assert.deepEqual([tls465.host, tls465.port, tls465.tls, tls465.user, tls465.from, tls465.fromName, tls465.timeoutMs], ['smtp.gmail.com', 465, 'implicit', 'sender@example.com', 'sender@example.com', 'PAI POS', 10000]);
  assert.equal(tls465.password, PASSWORD);
  const starttls = parseSmtp({ ...GOOD, SMTP_PORT: '', SMTP_SECURE: 'false' }, 'smtp');
  assert.deepEqual([starttls.port, starttls.tls], [587, 'starttls-required']);
  assert.equal(parseSmtp({ ...GOOD, SMTP_PORT: undefined, SMTP_SECURE: 'true' }, 'smtp').port, 465);
  assert.equal(parseSmtp({ ...GOOD, SMTP_FROM_NAME: 'Café Aroma' }, 'smtp').fromName, 'Café Aroma');
  assert.ok(Object.isFrozen(tls465), 'the settings cannot be changed at run time');
});

test('STARTTLS is optional only for a server on this machine (a mail catcher); anywhere else it is required', () => {
  const local = { SMTP_HOST: 'localhost', SMTP_PORT: '1025', SMTP_FROM: 'a@b.co' };
  assert.equal(parseSmtp(local, 'smtp').tls, 'starttls-optional');
  assert.equal(parseSmtp({ ...local, SMTP_HOST: '127.0.0.1' }, 'smtp').tls, 'starttls-optional');
  assert.equal(parseSmtp({ ...local, SMTP_HOST: 'mail.example.com' }, 'smtp').tls, 'starttls-required');
});

test('a server without sign-in is allowed (no user, no password), but only one of the two is a mistake', () => {
  assert.equal(parseSmtp({ SMTP_HOST: 'localhost', SMTP_PORT: '1025', SMTP_FROM: 'a@b.co' }, 'smtp').user, '');
  assert.throws(() => parseSmtp({ ...GOOD, SMTP_PASSWORD: '' }, 'smtp'), /SMTP_USER and SMTP_PASSWORD must be set together/);
  assert.throws(() => parseSmtp({ ...GOOD, SMTP_USER: '' }, 'smtp'), /SMTP_USER and SMTP_PASSWORD must be set together/);
});

test('every bad value is refused by the NAME of its variable, and no message ever contains the password', () => {
  const cases = [
    [{ SMTP_HOST: '' }, /SMTP_HOST is required/],
    [{ SMTP_HOST: 'https://smtp.gmail.com' }, /SMTP_HOST must be a host name/],
    [{ SMTP_HOST: 'smtp.gmail.com; rm -rf' }, /SMTP_HOST must be a host name/],
    [{ SMTP_PORT: '0' }, /SMTP_PORT/],
    [{ SMTP_PORT: '99999' }, /SMTP_PORT/],
    [{ SMTP_PORT: 'abc' }, /SMTP_PORT/],
    [{ SMTP_SECURE: 'yes' }, /SMTP_SECURE must be true or false/],
    [{ SMTP_FROM: '' }, /SMTP_FROM is required/],
    [{ SMTP_FROM: 'Bob <bob@example.com>' }, /SMTP_FROM must be a plain email address/],
    [{ SMTP_FROM: 'no-at-sign' }, /SMTP_FROM must be a plain email address/],
    [{ SMTP_FROM: 'a@b.com\r\nBcc: x@y.com' }, /SMTP_FROM must be a plain email address/],
    [{ SMTP_FROM_NAME: 'x'.repeat(71) }, /SMTP_FROM_NAME/],
    [{ SMTP_TIMEOUT_MS: '0' }, /SMTP_TIMEOUT_MS/],
    [{ SMTP_TIMEOUT_MS: '120000' }, /SMTP_TIMEOUT_MS must be at most 60000/],
  ];
  for (const [change, pattern] of cases) {
    const err = errorOf(() => parseSmtp({ ...GOOD, ...change }, 'smtp'));
    assert.ok(err, `should be refused: ${JSON.stringify(change)}`);
    assert.match(err.message, pattern);
    assert.ok(!err.message.includes(PASSWORD), 'the message never contains the password');
  }
});

test('DEV_SKIP_PHONE_VERIFICATION: off by default; only true/false; true is refused in production', () => {
  assert.equal(parseSkipPhoneVerification(undefined, false), false);
  assert.equal(parseSkipPhoneVerification('', false), false);
  assert.equal(parseSkipPhoneVerification('false', true), false, 'false is always fine, even in production');
  assert.equal(parseSkipPhoneVerification('true', false), true);
  assert.throws(() => parseSkipPhoneVerification('true', true), /not allowed when NODE_ENV=production/);
  assert.throws(() => parseSkipPhoneVerification('yes', false), /must be true or false/);
  assert.throws(() => parseSkipPhoneVerification('TRUE', false), /must be true or false/, 'no loose spellings');
});

// --- the real start-up, in a child process: the same code path as `node server.js` up to the configuration ---
const SERVICE_DIR = path.resolve(__dirname, '../..');
const SECRET_DB_PASSWORD = 'db-secret-pa55word';
function loadConfig(vars) {
  const env = {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, // enough to start node; nothing else is inherited
    JWT_SECRET: 'j'.repeat(40), INTERNAL_SERVICE_KEY: 'k'.repeat(40),
    REPOSITORY_DRIVER: 'prisma', AUTH_DATABASE_URL: `mysql://u:${SECRET_DB_PASSWORD}@127.0.0.1:3306/pos_auth_db`, // parsed only: nothing connects
    MESSAGE_DELIVERY: 'none',
    // Pinned (to "unset") so that whatever the developer keeps in backend/.env can never change the outcome of these tests:
    // dotenv does not override a variable that is already set, even to an empty value.
    NODE_ENV: '', DEV_SKIP_PHONE_VERIFICATION: '',
    SMTP_HOST: '', SMTP_PORT: '', SMTP_SECURE: '', SMTP_USER: '', SMTP_PASSWORD: '', SMTP_FROM: '', SMTP_FROM_NAME: '', SMTP_TIMEOUT_MS: '',
    ...vars,
  };
  const result = spawnSync(process.execPath, ['-e', "const { env } = require('./config'); console.log(JSON.stringify({ skip: env.skipPhoneVerification, delivery: env.messageDelivery, smtp: Boolean(env.smtp) }))"], { cwd: SERVICE_DIR, env, encoding: 'utf8' });
  return result;
}

test('start-up: production REFUSES to start with DEV_SKIP_PHONE_VERIFICATION=true, and prints no secret', () => {
  const result = loadConfig({ NODE_ENV: 'production', DEV_SKIP_PHONE_VERIFICATION: 'true' });
  assert.notEqual(result.status, 0, 'the process must exit with an error');
  assert.match(result.stderr, /DEV_SKIP_PHONE_VERIFICATION=true is a local-development bypass and is not allowed when NODE_ENV=production/);
  assert.ok(![result.stdout, result.stderr].join('').includes(SECRET_DB_PASSWORD), 'no database password in the output');
});

test('start-up: outside production the bypass starts; production without it starts too', () => {
  const dev = loadConfig({ NODE_ENV: 'development', DEV_SKIP_PHONE_VERIFICATION: 'true' });
  assert.equal(dev.status, 0, dev.stderr);
  assert.deepEqual(JSON.parse(dev.stdout), { skip: true, delivery: 'none', smtp: false });
  const unset = loadConfig({});
  assert.equal(unset.status, 0, 'NODE_ENV not set counts as development');
  const prod = loadConfig({ NODE_ENV: 'production' });
  assert.equal(prod.status, 0, prod.stderr);
  assert.deepEqual(JSON.parse(prod.stdout), { skip: false, delivery: 'none', smtp: false });
});

test('start-up: smtp mode without its settings refuses to start (naming the variable only); with them it starts, in production too', () => {
  const missing = loadConfig({ NODE_ENV: 'production', MESSAGE_DELIVERY: 'smtp', SMTP_PASSWORD: PASSWORD });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /SMTP_HOST is required/);
  assert.ok(!missing.stderr.includes(PASSWORD), 'the SMTP password is not printed');
  const ready = loadConfig({ NODE_ENV: 'production', MESSAGE_DELIVERY: 'smtp', ...GOOD });
  assert.equal(ready.status, 0, ready.stderr);
  assert.deepEqual(JSON.parse(ready.stdout), { skip: false, delivery: 'smtp', smtp: true });
  assert.ok(!ready.stdout.includes(PASSWORD));
});
