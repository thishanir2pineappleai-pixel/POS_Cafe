// One-time codes (email, phone, password reset). Codes come from crypto.randomInt, are stored only as keyed HMAC
// hashes, expire after policy.otp.ttlMs, lock after policy.otp.maxAttempts wrong guesses, can be used once, and a new
// code invalidates the previous one. Resends are limited by a cooldown and an hourly cap.
// This service never delivers anything and never logs a code; delivery is services/email and services/sms.
const crypto = require('node:crypto');
const { otpRepository } = require('../../repositories');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('../../config/constants/messages');
const { env, policy } = require('../../config');
const clock = require('@pos-cafe/shared/clock');

const HOUR = 60 * 60 * 1000;
const key = crypto.createHmac('sha256', env.jwtSecret).update('otp').digest();

// Keyed hash: a leaked table of hashes can not be brute-forced offline without the server secret.
const hashValue = (purpose, subject, value) => crypto.createHmac('sha256', key).update(`${purpose}:${subject}:${value}`).digest('hex');
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

const tooMany = (retryAfterSeconds) => {
  const err = new AppError(429, ERROR_CODES.TOO_MANY_REQUESTS, MESSAGES.TOO_MANY);
  err.retryAfterSeconds = retryAfterSeconds;
  return err;
};

// Creates a new code for (purpose, subject) and returns it so the CALLER can deliver it. Throws a 429 AppError when
// a code was issued too recently or too many were issued in the last hour.
async function issue({ purpose, subject }) {
  const now = clock.now();
  const past = await otpRepository.history(purpose, subject);
  const last = past[past.length - 1];
  if (last && now - last.createdAt < policy.otp.resendCooldownMs) {
    throw tooMany(Math.ceil((policy.otp.resendCooldownMs - (now - last.createdAt)) / 1000));
  }
  const recent = past.filter((r) => now - r.createdAt < HOUR);
  if (recent.length >= policy.otp.maxSendsPerHour) throw tooMany(Math.ceil((HOUR - (now - recent[0].createdAt)) / 1000));

  const code = String(crypto.randomInt(0, 10 ** policy.otp.length)).padStart(policy.otp.length, '0');
  await otpRepository.invalidateActive(purpose, subject, now);
  await otpRepository.create({ purpose, subject, hash: hashValue(purpose, subject, code), expiresAt: now + policy.otp.ttlMs, createdAt: now });
  return { code, expiresAt: now + policy.otp.ttlMs };
}

// Returns 'ok', 'missing' (none issued, or already used), 'expired', 'locked' (too many wrong guesses) or 'invalid'.
async function verify({ purpose, subject, code }) {
  const now = clock.now();
  const record = await otpRepository.latestActive(purpose, subject);
  if (!record) return 'missing';
  if (record.expiresAt <= now) { await otpRepository.update(record.id, { invalidatedAt: now }); return 'expired'; }
  if (record.attempts >= policy.otp.maxAttempts) return 'locked';
  const given = typeof code === 'string' ? code : '';
  if (!safeEqual(record.hash, hashValue(purpose, subject, given))) {
    await otpRepository.update(record.id, { attempts: record.attempts + 1 });
    return 'invalid';
  }
  await otpRepository.update(record.id, { usedAt: now }); // single use
  return 'ok';
}

const invalidate = (purpose, subject) => otpRepository.invalidateActive(purpose, subject, clock.now());

module.exports = { issue, verify, invalidate, hashValue, safeEqual };
