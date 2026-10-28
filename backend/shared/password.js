// Password hashing. NOTE: the file name comes from the project structure, but this uses Node's built-in `scrypt`
// (a memory-hard key derivation function with a random salt), because no bcrypt or argon2 package is approved.
// No dependency is needed. Switching to bcrypt or argon2 later is a one-file change: keep these two exports.
//
// Stored format: scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>. The parameters travel with the hash, so they can
// be raised later without breaking old hashes. Plaintext passwords are never stored, returned or logged.
const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

const PARAMS = { N: 2 ** 16, r: 8, p: 2 }; // from the OWASP password-storage guidance for scrypt
const KEY_LENGTH = 64;
const MAX_MEMORY = 128 * 1024 * 1024; // scrypt needs about 64 MiB with these parameters

async function derive(password, salt, { N, r, p }) {
  return scrypt(password, salt, KEY_LENGTH, { N, r, p, maxmem: MAX_MEMORY });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await derive(password, salt, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

// For the future login flow (not built yet). Constant-time comparison; malformed input is simply "false".
async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const [scheme, N, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !hash) return false;
  try {
    const expected = Buffer.from(hash, 'base64');
    const actual = await derive(password, Buffer.from(salt, 'base64'), { N: Number(N), r: Number(r), p: Number(p) });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false; // unusable stored value (bad parameters or salt)
  }
}

module.exports = { hashPassword, verifyPassword };
