// Client-side checks for the Login, Signup and Forgot Password screens. Each returns an error message, or '' when fine.
// Only the password rule below is stated in the Figma. Everything marked PENDING is a provisional choice.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_RULE_TEXT = 'Use 8 characters with uppercase, lowercase, numbers, and symbols. No spaces.';

export const validateRequired = (value, message) => (String(value ?? '').trim() ? '' : message);

export function validateEmail(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'Enter your email address.';
  return EMAIL.test(text) ? '' : 'Enter a valid email address.';
}

// PENDING: digits with an optional +, spaces or dashes, 9-15 digits (the Figma shows only "eg; 0712345678").
export function validatePhone(value) {
  const text = String(value ?? '').trim();
  if (!text) return 'Enter the phone number.';
  return /^\+?[\d\s-]+$/.test(text) && text.replace(/\D/g, '').length >= 9 && text.replace(/\D/g, '').length <= 15
    ? '' : 'Enter a valid phone number.';
}

// 6 digits, one per box. PENDING: the Figma shows boxes only; the length comes from the six boxes.
export const OTP_LENGTH = 6;
export const validateOtp = (code) => (new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code) ? '' : `Enter the ${OTP_LENGTH}-digit code.`);

// The reset-password rule from the Figma: 8 characters with uppercase, lowercase, numbers and symbols, no spaces.
export function checkPassword(password) {
  const rules = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9\s]/.test(password),
    noSpaces: !/\s/.test(password),
  };
  return { rules, ok: Object.values(rules).every(Boolean) };
}

// Drives the strength bar: nothing below 8 characters, yellow while a rule is missing, green when all pass.
export function passwordStrength(password) {
  if (password.length < 8) return 'none';
  return checkPassword(password).ok ? 'strong' : 'weak';
}

export function validateNewPassword(password) {
  if (!password) return 'Enter your new password.';
  return checkPassword(password).ok ? '' : PASSWORD_RULE_TEXT;
}

export const validateConfirm = (password, confirm) => (confirm === password && confirm ? '' : 'Passwords do not match.');

// Turns a failed API result ({ ok: false, error, fields }) into screen errors. `fieldMap` renames the server's field names to
// the screen's (for example acceptTerms -> agreed). Without a field-specific message the whole message goes to `_form`.
export function serverErrors(result, fieldMap = {}) {
  const out = {};
  for (const [field, message] of Object.entries(result.fields ?? {})) out[fieldMap[field] ?? field] = message;
  if (Object.keys(out).length === 0) out._form = result.error;
  return out;
}
