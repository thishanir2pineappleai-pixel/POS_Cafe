// Sign-in, sessions and password recovery.
//   * Login failures are always the same 401 (unknown email, wrong password, inactive account), and an unknown email
//     still pays for one password hash so the answer does not arrive faster.
//   * Forgot-password answers the same way whether or not the email is registered (no account enumeration).
//   * Passwords, codes, tokens and hashes are never logged and never returned (except the access token at login and the
//     short-lived reset token after a correct code).
const crypto = require('node:crypto');
const {
  adminProfileRepository, otpRepository, sessionRepository,
} = require('../../repositories');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('../../config/constants/messages');
const { policy } = require('../../config');
const clock = require('@pos-cafe/shared/clock');
const emailService = require('../email/emailService');
const emailProvider = require('../integration/emailProvider');
const settingsClient = require('../integration/settingsClient');
const { hashPassword, verifyPassword } = require('@pos-cafe/shared/password');
const jwtService = require('./jwtService');
const otpService = require('./otpService');

const invalidCredentials = () => new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, MESSAGES.LOGIN_FAILED);
const invalidCode = () => new AppError(400, ERROR_CODES.INVALID_CODE, MESSAGES.CODE_INVALID);
const invalidResetToken = () => new AppError(400, ERROR_CODES.INVALID_RESET_TOKEN, MESSAGES.RESET_TOKEN_INVALID);

let dummyHash;
const getDummyHash = () => { dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex')); return dummyHash; };

const roleLabel = (role) => (role === 'owner' ? 'Owner' : 'Admin');
const userDto = (u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, role: roleLabel(u.role), accountId: u.accountId });

async function login({ email, password, keepSignedIn }) {
  const user = await adminProfileRepository.findByEmail(email);
  const passwordOk = await verifyPassword(password, user ? user.passwordHash : await getDummyHash());
  if (!user || !passwordOk || user.status !== 'active') throw invalidCredentials();

  const ttlSeconds = keepSignedIn ? policy.session.keepSignedInTtlSeconds : policy.session.ttlSeconds;
  const now = clock.now();
  const session = await sessionRepository.create({ userId: user.id, accountId: user.accountId, createdAt: now, expiresAt: now + ttlSeconds * 1000 });
  const { token, expiresAt } = jwtService.sign({ sub: user.id, sid: session.sid, aid: user.accountId }, { ttlSeconds });
  await adminProfileRepository.touchLogin(user.id, now);
  return { token, tokenType: 'Bearer', expiresAt: new Date(expiresAt).toISOString(), user: userDto(user) };
}

const logout = (auth) => sessionRepository.revoke(auth.sessionId, clock.now());

// The session behind a token (already verified by the caller) must exist, belong to that user and be neither revoked
// nor expired, and the user must still be active. Returns the request identity, or null. Used by this service's own
// authenticate middleware and by POST /internal/sessions/verify for the other services.
async function verifySession({ sessionId, userId }) {
  const session = typeof sessionId === 'string' ? await sessionRepository.find(sessionId) : null;
  if (!session || session.revokedAt || session.expiresAt <= clock.now() || session.userId !== userId) return null;
  const user = await adminProfileRepository.findById(userId);
  if (!user || user.status !== 'active') return null;
  return { userId: user.id, accountId: user.accountId, role: user.role, sessionId: session.sid };
}

async function me(auth) {
  const user = await adminProfileRepository.findById(auth.userId);
  const shops = await settingsClient.listShops(auth.accountId); // owned by the Settings Service; 503 when it is unreachable
  return { ...userDto(user), shops: shops.map((s) => ({ id: s.id, name: s.name })) };
}

// Always resolves to the same public answer. A code is issued only for an active account, and a cooldown or hourly
// limit for a real account is swallowed so it can not be told apart from an unknown email.
async function requestPasswordReset({ email }) {
  const user = await adminProfileRepository.findByEmail(email);
  if (user && user.status === 'active') {
    try {
      const { code } = await otpService.issue({ purpose: 'password_reset', subject: String(user.id) });
      await emailService.sendPasswordResetCode(user.email, code);
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
    }
  }
  return { deliveryConfigured: emailProvider.isConfigured() };
}

// A correct code returns a single-use reset token. Every failure (unknown email, wrong, expired, locked, reused) is the same 400.
async function verifyPasswordResetCode({ email, code }) {
  const user = await adminProfileRepository.findByEmail(email);
  const result = user ? await otpService.verify({ purpose: 'password_reset', subject: String(user.id), code }) : 'missing';
  if (!user || result !== 'ok') throw invalidCode();

  const subject = String(user.id);
  const now = clock.now();
  const token = crypto.randomBytes(32).toString('base64url');
  await otpRepository.invalidateActive('reset_token', subject, now);
  await otpRepository.create({ purpose: 'reset_token', subject, hash: otpService.hashValue('reset_token', 'token', token), expiresAt: now + policy.resetToken.ttlMs, createdAt: now });
  return { resetToken: token, expiresInSeconds: Math.round(policy.resetToken.ttlMs / 1000) };
}

async function resetPassword({ resetToken, password }) {
  const now = clock.now();
  const record = await otpRepository.findActiveByHash('reset_token', otpService.hashValue('reset_token', 'token', resetToken));
  if (!record || record.expiresAt <= now) throw invalidResetToken();
  const user = await adminProfileRepository.findById(Number(record.subject));
  if (!user) throw invalidResetToken();
  if (await verifyPassword(password, user.passwordHash)) { // the design: "make sure it's different from your previous password"
    throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, MESSAGES.VALIDATION_FAILED, [{ field: 'password', message: 'Must be different from your previous password' }]);
  }
  await adminProfileRepository.setPasswordHash(user.id, await hashPassword(password));
  await otpRepository.update(record.id, { usedAt: now }); // the token works once
  await otpService.invalidate('password_reset', record.subject);
  await sessionRepository.revokeAllForUser(user.id, now); // everyone who was signed in is signed out
}

module.exports = { login, logout, me, verifySession, requestPasswordReset, verifyPasswordResetCode, resetPassword, userDto };
