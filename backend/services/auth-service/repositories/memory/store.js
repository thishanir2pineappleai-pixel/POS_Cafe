// TEMPORARY IN-MEMORY STORAGE of the Auth Service (development default, no database needed).
//
//   * Everything here is LOST WHEN THE SERVICE RESTARTS. Nothing is seeded: every collection starts empty.
//   * The Auth Service owns accounts, users (owner and admins, kept as "adminProfiles"), sessions, signup registrations
//     and one-time codes. Persistent storage (MySQL through Prisma) is prepared in a later phase; services never touch
//     this file, only the repositories do.
//   * Shops are not stored here: they belong to the Settings Service (see services/integration/settingsClient.js).
const clock = require('@pos-cafe/shared/clock');

const emptyStore = () => ({
  // id -> { id, accountId, role, status, firstName, lastName, phone, phoneNormalized, email, passwordHash, ... } (password HASH only)
  adminProfiles: new Map(),
  registrations: new Map(), // unfinished and finished signups: hashed token, hashed password, step status, hashed access key
  otps: new Map(), // verification codes and reset tokens, stored only as keyed hashes
  sessions: new Map(), // sid -> { sid, userId, accountId, expiresAt, revokedAt }
  rateLimits: new Map(), // "name:key" -> [timestamps]
  outbox: [], // messages captured by MESSAGE_DELIVERY=dev-outbox (local testing only, never in production)
  lastId: { adminProfiles: 0, registrations: 0, otps: 0, accounts: 0 },
});

const store = emptyStore();

function nextId(table) {
  store.lastId[table] += 1;
  return store.lastId[table];
}

// Used by the automated tests to start from empty collections. The rate limiter keeps a reference to the rateLimits Map,
// so its contents are cleared instead of the Map being replaced.
function reset() {
  store.rateLimits.clear();
  const { rateLimits } = store;
  Object.assign(store, emptyStore(), { rateLimits });
  clock.reset();
}

const clone = (value) => structuredClone(value);
const now = () => new Date().toISOString();

module.exports = { store, nextId, reset, clone, now };
