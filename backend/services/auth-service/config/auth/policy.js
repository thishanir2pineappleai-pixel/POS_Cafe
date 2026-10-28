// Every number of the sign-in, signup and password-recovery rules, in one place so they can be reviewed and approved.
//
// CONFIRMED by the designs: a verification code is six digits and "expires in 02:59" (three minutes);
// the password rule is "8 characters with uppercase, lowercase, numbers, and symbols, no spaces".
// Everything else is a PROVISIONAL security default that still needs approval.
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

module.exports = Object.freeze({
  otp: {
    length: 6,
    ttlMs: 3 * MINUTE, // CONFIRMED (design: "Code expires in: 02:59")
    maxAttempts: 5, // wrong guesses before a code is locked
    resendCooldownMs: MINUTE, // minimum gap between two codes
    maxSendsPerHour: 5,
  },
  // The designs define no access-key format, expiry or attempt rule. Single use is implied by "activate your account".
  accessKey: { ttlMs: 72 * HOUR, maxAttempts: 5, resendCooldownMs: MINUTE, maxSendsPerHour: 5 },
  registration: { ttlMs: 24 * HOUR }, // how long an unfinished signup survives
  resetToken: { ttlMs: 10 * MINUTE }, // the proof handed out after a reset code is verified
  session: { ttlSeconds: 12 * 3600, keepSignedInTtlSeconds: 30 * 24 * 3600 }, // "Keep me signed in" is on the login design
  password: { min: 8, max: 128 }, // min 8 is CONFIRMED by the reset design; max is a hashing-cost guard
  rateLimits: {
    login: { windowMs: 15 * MINUTE, max: 10 }, // per IP + email
    signupCredentials: { windowMs: HOUR, max: 10 }, // per IP
    verify: { windowMs: 15 * MINUTE, max: 30 }, // per IP, on top of the per-code attempt limit
    resend: { windowMs: HOUR, max: 10 }, // per IP
    activate: { windowMs: 15 * MINUTE, max: 10 }, // per IP + email
    forgotPassword: { windowMs: HOUR, max: 5 }, // per email, applied whether or not the account exists
    forgotPasswordIp: { windowMs: HOUR, max: 20 }, // per IP
    resetPassword: { windowMs: 15 * MINUTE, max: 10 }, // per IP
  },
});
