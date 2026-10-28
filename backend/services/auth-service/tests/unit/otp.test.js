// Unit tests for one-time codes: unpredictable, stored only as hashes, expiring, attempt-limited, single-use,
// resend-limited. No HTTP, no database.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const otpService = require('../../services/auth/otpService');
const accessKeyService = require('../../services/auth/accessKeyService');
const clock = require('@pos-cafe/shared/clock');
const { store, reset } = require('../../repositories/memory/store');
const { policy } = require('../../config');

beforeEach(() => reset());

const ctx = { purpose: 'signup_email', subject: '1' };
const wrongCode = (code) => (code === '000000' ? '111111' : '000000');

test('codes are six digits, differ from each other, and are stored only as hashes', async () => {
  const { code } = await otpService.issue(ctx);
  assert.match(code, /^\d{6}$/);
  const rows = [...store.otps.values()];
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows).includes(code), 'the plain code is not stored');
  assert.match(rows[0].hash, /^[0-9a-f]{64}$/);
  const seen = new Set();
  for (let i = 0; i < 25; i += 1) {
    clock.advance(policy.otp.resendCooldownMs + 1);
    if (i % 4 === 3) clock.advance(60 * 60 * 1000); // stay under the hourly cap
    seen.add((await otpService.issue(ctx)).code);
  }
  assert.ok(seen.size > 15, 'codes are not predictable');
});

test('a correct code verifies once; reuse is refused', async () => {
  const { code } = await otpService.issue(ctx);
  assert.equal(await otpService.verify({ ...ctx, code }), 'ok');
  assert.equal(await otpService.verify({ ...ctx, code }), 'missing');
});

test('a code belongs to its purpose and subject', async () => {
  const { code } = await otpService.issue(ctx);
  assert.equal(await otpService.verify({ ...ctx, subject: '2', code }), 'missing');
  assert.equal(await otpService.verify({ ...ctx, purpose: 'signup_phone', code }), 'missing');
  assert.equal(await otpService.verify({ ...ctx, code }), 'ok');
});

test('a code expires after three minutes', async () => {
  const { code } = await otpService.issue(ctx);
  clock.advance(policy.otp.ttlMs - 1000);
  assert.equal(await otpService.verify({ ...ctx, code: wrongCode(code) }), 'invalid');
  clock.advance(2000);
  assert.equal(await otpService.verify({ ...ctx, code }), 'expired');
  assert.equal(await otpService.verify({ ...ctx, code }), 'missing');
});

test('five wrong guesses lock the code, even for the right code', async () => {
  const { code } = await otpService.issue(ctx);
  for (let i = 0; i < policy.otp.maxAttempts; i += 1) assert.equal(await otpService.verify({ ...ctx, code: wrongCode(code) }), 'invalid');
  assert.equal(await otpService.verify({ ...ctx, code }), 'locked');
  assert.equal(await otpService.verify({ ...ctx, code }), 'locked');
});

test('a new code replaces the previous one', async () => {
  const first = await otpService.issue(ctx);
  clock.advance(policy.otp.resendCooldownMs + 1);
  const second = await otpService.issue(ctx);
  if (first.code !== second.code) assert.equal(await otpService.verify({ ...ctx, code: first.code }), 'invalid');
  assert.equal(await otpService.verify({ ...ctx, code: second.code }), 'ok');
});

test('resends are limited by a cooldown and an hourly cap', async () => {
  await otpService.issue(ctx);
  await assert.rejects(otpService.issue(ctx), (err) => err.status === 429 && err.retryAfterSeconds > 0 && err.retryAfterSeconds <= 60);
  for (let i = 1; i < policy.otp.maxSendsPerHour; i += 1) {
    clock.advance(policy.otp.resendCooldownMs + 1);
    await otpService.issue(ctx);
  }
  clock.advance(policy.otp.resendCooldownMs + 1);
  await assert.rejects(otpService.issue(ctx), (err) => err.status === 429 && err.retryAfterSeconds > 60);
  clock.advance(60 * 60 * 1000);
  await otpService.issue(ctx); // a new hour
});

test('access keys: format, hashed storage, tolerant typing, wrong keys', () => {
  const key = accessKeyService.generate();
  assert.match(key, /^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){3}$/);
  assert.notEqual(key, accessKeyService.generate());
  const hash = accessKeyService.hash(key);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.ok(!hash.includes(key.replace(/-/g, '')));
  assert.equal(accessKeyService.matches(hash, key), true);
  assert.equal(accessKeyService.matches(hash, key.toLowerCase().replace(/-/g, ' ')), true);
  assert.equal(accessKeyService.matches(hash, '888888'), false);
  assert.equal(accessKeyService.matches(hash, ''), false);
  assert.equal(accessKeyService.matches(null, key), false);
  assert.equal(accessKeyService.matches(hash, 12345), false);
});
