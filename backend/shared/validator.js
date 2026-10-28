// Small input parsers. Each returns the cleaned value, or null when the input is not acceptable.
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isBlank = (v) => v === undefined || v === null || v === '';

// Trimmed string of min..max characters (strings only).
function toText(value, { min = 1, max = 255 } = {}) {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/\s+/g, ' ');
  return text.length >= min && text.length <= max ? text : null;
}

// Whole number (a number or a digits-only string) from min..max.
function toInt(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n >= min && n <= max ? n : null;
}

// Non-negative amount with at most 2 decimals.
function toAmount(value, { max = 99999999.99 } = {}) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const n = Number(text);
  return n <= max ? n : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isEmail = (value) => typeof value === 'string' && value.length <= 254 && EMAIL.test(value);

// Phone numbers: digits with an optional leading +, spaces or dashes, 9-15 digits (PENDING approval, as on the signup design).
function toPhone(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const digits = text.replace(/\D/g, '');
  return /^\+?[\d\s-]+$/.test(text) && digits.length >= 9 && digits.length <= 15 ? text : null;
}
const normalizePhone = (phone) => `${phone.trim().startsWith('+') ? '+' : ''}${phone.replace(/\D/g, '')}`;

// The password rule from the reset-password design: 8 characters with uppercase, lowercase, numbers and symbols,
// no spaces. The text is the design's own wording. The upper bound only keeps hashing cheap to abuse-proof.
const PASSWORD_RULE_TEXT = 'Use 8 characters with uppercase, lowercase, numbers, and symbols. No spaces.';
const PASSWORD_MAX = 128;
function passwordProblem(password) {
  if (typeof password !== 'string' || password === '') return 'Required';
  if (password.length > PASSWORD_MAX) return `Must be at most ${PASSWORD_MAX} characters`;
  const ok = password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password)
    && /[^A-Za-z0-9\s]/.test(password) && !/\s/.test(password);
  return ok ? '' : PASSWORD_RULE_TEXT;
}

module.exports = { isPlainObject, isBlank, toText, toInt, toAmount, isEmail, toPhone, normalizePhone, PASSWORD_RULE_TEXT, passwordProblem };
