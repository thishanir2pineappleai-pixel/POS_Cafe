// The signup workflow. A registration is a SEPARATE, unfinished record: it is not a user, so nobody can sign in until
// the last step (access-key activation) succeeds. Steps must be done in order, enforced by the registration status:
//
//   email_pending -> (email code) -> owner_pending -> (owner details) -> phone_pending -> (phone code)
//   -> business_pending -> (business details, access key issued) -> awaiting_activation -> (access key) -> activated
//
// Before activation the only things a registration can do are these steps. Its secrets are stored as hashes (token,
// password, code, access key). Activation creates the account, its owner and its first shop in one atomic step.
// Nothing is marked verified or activated until the matching server-side check passed.
const crypto = require('node:crypto');
const { accountRepository, adminProfileRepository, registrationRepository } = require('../../repositories');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('../../config/constants/messages');
const { policy, env } = require('../../config');
const clock = require('@pos-cafe/shared/clock');
const { normalizePhone } = require('@pos-cafe/shared/validator');
const emailService = require('../email/emailService');
const emailProvider = require('../integration/emailProvider');
const settingsClient = require('../integration/settingsClient');
const smsService = require('../sms/smsService');
const accessKeyService = require('./accessKeyService');
const { hashPassword } = require('@pos-cafe/shared/password');
const otpService = require('./otpService');

const HOUR = 60 * 60 * 1000;
const STEP_OF = {
  email_pending: 'email_verification',
  owner_pending: 'owner_details',
  phone_pending: 'phone_verification',
  business_pending: 'business_details',
  awaiting_activation: 'access_key',
  activated: 'login',
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex'); // the token itself is 256 random bits
const duplicate = (field, message) => new AppError(409, ERROR_CODES.DUPLICATE, message, [{ field, message: 'Already in use' }]);
const invalidAccessKey = () => new AppError(400, ERROR_CODES.INVALID_ACCESS_KEY, MESSAGES.ACCESS_KEY_INVALID, [{ field: 'accessKey', message: 'Invalid access key.' }]);

// The registration behind a token, which must be in one of the allowed statuses. A wrong status answers with the step to do.
async function load(token, allowed) {
  const row = await registrationRepository.findByTokenHash(hashToken(token));
  if (!row || row.status === 'activated' || row.tokenExpiresAt <= clock.now()) {
    throw new AppError(400, ERROR_CODES.INVALID_REGISTRATION, MESSAGES.REGISTRATION_INVALID);
  }
  if (!allowed.includes(row.status)) {
    const err = new AppError(409, ERROR_CODES.WRONG_STEP, MESSAGES.WRONG_STEP, [{ field: 'step', message: `Expected step: ${STEP_OF[row.status]}` }]);
    err.nextStep = STEP_OF[row.status];
    throw err;
  }
  return row;
}

// Maps a code-check result to a response that helps the person typing (this is behind the registration token, so it
// does not reveal anything about other accounts).
function requireValidCode(result) {
  if (result === 'ok') return;
  const messages = {
    expired: 'The code has expired. Request a new one',
    locked: 'Too many wrong attempts. Request a new code',
    missing: 'There is no active code. Request a new one',
    invalid: 'The code is incorrect',
  };
  throw new AppError(400, ERROR_CODES.INVALID_CODE, messages[result] ?? MESSAGES.CODE_INVALID, [{ field: 'code', message: result }]);
}

async function sendEmailCode(reg) {
  const { code } = await otpService.issue({ purpose: 'signup_email', subject: String(reg.id) });
  return emailService.sendVerificationCode(reg.email, code);
}
async function sendPhoneCode(reg) {
  const { code } = await otpService.issue({ purpose: 'signup_phone', subject: String(reg.id) });
  return smsService.sendVerificationCode(reg.phone, code);
}

// Step 1. An email that already belongs to a user is refused; an unfinished signup for the same email is replaced.
async function start({ email, username, password }) {
  if (await adminProfileRepository.findByEmail(email)) throw duplicate('email', 'An account with this email already exists');
  const open = await registrationRepository.findOpenByEmail(email);
  if (open) await registrationRepository.remove(open.id);

  const now = clock.now();
  const token = crypto.randomBytes(32).toString('base64url');
  const reg = await registrationRepository.create({
    tokenHash: hashToken(token),
    tokenExpiresAt: now + policy.registration.ttlMs,
    email,
    username,
    passwordHash: await hashPassword(password),
    termsAcceptedAt: now,
    status: 'email_pending',
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    createdAt: now,
  });
  const delivery = await sendEmailCode(reg);
  return { registrationToken: token, expiresAt: new Date(reg.tokenExpiresAt).toISOString(), nextStep: STEP_OF[reg.status], delivery };
}

async function verifyEmail({ registrationToken, code }) {
  const reg = await load(registrationToken, ['email_pending']);
  requireValidCode(await otpService.verify({ purpose: 'signup_email', subject: String(reg.id), code }));
  await registrationRepository.update(reg.id, { status: 'owner_pending', emailVerifiedAt: clock.now() });
  return { nextStep: STEP_OF.owner_pending };
}

async function resendEmail({ registrationToken }) {
  const reg = await load(registrationToken, ['email_pending']);
  return { delivery: await sendEmailCode(reg) };
}

// Step 3. The owner may fix a wrong phone number while still in the phone-verification step.
async function setOwner({ registrationToken, ownerName, phone }) {
  const reg = await load(registrationToken, ['owner_pending', 'phone_pending']);
  const phoneNormalized = normalizePhone(phone);
  if (await adminProfileRepository.findByPhone(phoneNormalized)) throw duplicate('phone', 'An account with this phone number already exists');
  // LOCAL DEVELOPMENT ONLY (DEV_SKIP_PHONE_VERIFICATION=true; refused at start-up in production): there is no SMS provider, so the
  // phone step cannot be completed. The number is kept but stays UNVERIFIED (phoneVerifiedAt remains null, so the account is never
  // recorded as phone-verified) and the response says so. The email step is untouched: this branch is only reachable after it.
  if (env.skipPhoneVerification) {
    await registrationRepository.update(reg.id, { ownerName, phone, phoneNormalized, status: 'business_pending', phoneVerifiedAt: null });
    return {
      nextStep: STEP_OF.business_pending,
      phoneVerification: 'skipped',
      delivery: { channel: 'sms', delivered: false, reason: 'phone_verification_skipped' },
    };
  }
  const updated = await registrationRepository.update(reg.id, { ownerName, phone, phoneNormalized, status: 'phone_pending', phoneVerifiedAt: null });
  const delivery = await sendPhoneCode(updated);
  return { nextStep: STEP_OF.phone_pending, delivery };
}

async function verifyPhone({ registrationToken, code }) {
  const reg = await load(registrationToken, ['phone_pending']);
  requireValidCode(await otpService.verify({ purpose: 'signup_phone', subject: String(reg.id), code }));
  await registrationRepository.update(reg.id, { status: 'business_pending', phoneVerifiedAt: clock.now() });
  return { nextStep: STEP_OF.business_pending };
}

async function resendPhone({ registrationToken }) {
  const reg = await load(registrationToken, ['phone_pending']);
  return { delivery: await sendPhoneCode(reg) };
}

// Issues a new access key for a registration row, storing only its hash. Returns the plain key for the caller to deliver.
async function issueAccessKey(reg) {
  const now = clock.now();
  const sends = (reg.accessKeySends ?? []).filter((t) => now - t < HOUR);
  const last = sends[sends.length - 1];
  if (sends.length >= policy.accessKey.maxSendsPerHour || (last && now - last < policy.accessKey.resendCooldownMs)) return null;
  const key = accessKeyService.generate();
  await registrationRepository.update(reg.id, {
    status: 'awaiting_activation',
    accessKeyHash: accessKeyService.hash(key),
    accessKeyExpiresAt: now + policy.accessKey.ttlMs,
    accessKeyAttempts: 0,
    accessKeySends: [...sends, now],
  });
  return key;
}

// Step 5. PENDING: the Figma toast says the key is sent right after this step, while the next screen says "once
// approved". An approval step has no designed approver, so the key is issued automatically here.
async function setBusiness({ registrationToken, businessName, address }) {
  const reg = await load(registrationToken, ['business_pending']);
  const updated = await registrationRepository.update(reg.id, { businessName, address });
  const key = await issueAccessKey(updated);
  if (!key) throw new AppError(429, ERROR_CODES.TOO_MANY_REQUESTS, MESSAGES.TOO_MANY);
  const delivery = await emailService.sendAccessKey(reg.email, key);
  return { nextStep: STEP_OF.awaiting_activation, delivery };
}

// Always answers the same way for the public. A new key replaces the old one (and resets its attempt counter).
async function resendAccessKey({ email }) {
  const reg = await registrationRepository.findOpenByEmail(email);
  if (reg && reg.status === 'awaiting_activation') {
    const key = await issueAccessKey(reg);
    if (key) await emailService.sendAccessKey(reg.email, key);
  }
  return { deliveryConfigured: emailProvider.isConfigured() };
}

const splitName = (name) => {
  const [first, ...rest] = name.split(' ');
  return { firstName: first, lastName: rest.join(' ') };
};

// Final step. Every failure (unknown email, wrong key, expired, too many attempts, already used) is the same 400.
// The email and phone are checked again because someone else may have taken them since the first step.
async function activate({ email, accessKey }) {
  const reg = await registrationRepository.findOpenByEmail(email);
  const now = clock.now();
  if (!reg || reg.status !== 'awaiting_activation' || !reg.accessKeyHash || reg.accessKeyExpiresAt <= now
    || reg.accessKeyAttempts >= policy.accessKey.maxAttempts) throw invalidAccessKey();
  if (!accessKeyService.matches(reg.accessKeyHash, accessKey)) {
    await registrationRepository.update(reg.id, { accessKeyAttempts: reg.accessKeyAttempts + 1 });
    throw invalidAccessKey();
  }
  if (await adminProfileRepository.findByEmail(reg.email)) throw duplicate('email', 'An account with this email already exists');
  if (await adminProfileRepository.findByPhone(reg.phoneNormalized)) throw duplicate('phone', 'An account with this phone number already exists');

  // Role, status and verification times are decided here, never taken from a request.
  const { accountId, owner } = await accountRepository.createWithOwner({
    owner: {
      ...splitName(reg.ownerName),
      username: reg.username,
      phone: reg.phone,
      phoneNormalized: reg.phoneNormalized,
      email: reg.email,
      passwordHash: reg.passwordHash,
      role: 'owner',
      status: 'active',
      emailVerifiedAt: reg.emailVerifiedAt,
      phoneVerifiedAt: reg.phoneVerifiedAt,
    },
  });
  // The first shop belongs to the Settings Service. The signup collects no shop phone or timezone, so the phone starts as
  // the owner's and the timezone is unset (PENDING approval); Settings requires both when the shop is next edited.
  // If the Settings Service cannot do it the owner is removed again, so activation either completes or leaves nothing
  // behind. (A shop created just before a lost answer stays orphaned in Settings until persistence adds a real transaction.)
  try {
    await settingsClient.createFirstShop(accountId, { ownerId: owner.id, name: reg.businessName, address: reg.address, phone: reg.phone });
  } catch (err) {
    await accountRepository.removeOwner(owner.id);
    throw err;
  }
  // Used once: the secrets are wiped from the finished registration.
  await registrationRepository.update(reg.id, {
    status: 'activated', activatedAt: now, accessKeyHash: null, passwordHash: null, tokenHash: null,
  });
  return { activated: true };
}

module.exports = { start, verifyEmail, resendEmail, setOwner, verifyPhone, resendPhone, setBusiness, resendAccessKey, activate };
