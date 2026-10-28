// Account-activation access keys. The designs define no key format, so this is a PROVISIONAL choice: 16 characters from
// an unambiguous alphabet in four groups (XXXX-XXXX-XXXX-XXXX, about 80 bits), generated with crypto.randomInt and
// stored only as a keyed hash. Expiry, attempt limit and resend limits come from config/auth/policy.js (also pending).
const crypto = require('node:crypto');
const { env } = require('../../config');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0 or 1
const key = crypto.createHmac('sha256', env.jwtSecret).update('access-key').digest();

function generate() {
  const chars = Array.from({ length: 16 }, () => ALPHABET[crypto.randomInt(0, ALPHABET.length)]);
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

// Typing differences (case, spaces, dashes) must not matter.
const normalize = (input) => String(input ?? '').toUpperCase().replace(/[\s-]/g, '');

const hash = (input) => crypto.createHmac('sha256', key).update(normalize(input)).digest('hex');

function matches(storedHash, input) {
  if (typeof storedHash !== 'string' || typeof input !== 'string') return false;
  const given = hash(input);
  return given.length === storedHash.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(storedHash));
}

module.exports = { generate, normalize, hash, matches };
