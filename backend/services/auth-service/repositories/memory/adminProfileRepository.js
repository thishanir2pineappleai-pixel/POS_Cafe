// In-memory USER repository (the login users: an account's owner and the admins it adds; temporary, see store.js).
// Rows hold a password HASH only. Callers that build API output must drop `passwordHash` (the service does).
const { store, nextId, clone, now } = require('./store');

module.exports = {
  // Users of one account only (an account never sees another account's people), newest first.
  async listByAccount(accountId) {
    return [...store.adminProfiles.values()].filter((a) => a.accountId === accountId).sort((a, b) => b.id - a.id).map(clone);
  },
  // data: { firstName, lastName, phone, email, phoneNormalized } (never touches the password)
  async update(id, data) {
    const existing = store.adminProfiles.get(id);
    if (!existing) return null;
    // Only the profile fields can change here (same as the Prisma repository): never the role, status, password or account.
    const profile = Object.fromEntries(['firstName', 'lastName', 'phone', 'email', 'phoneNormalized'].filter((f) => data[f] !== undefined).map((f) => [f, data[f]]));
    const row = { ...existing, ...profile, updatedAt: now() };
    store.adminProfiles.set(id, row);
    return clone(row);
  },
  // Returns the previous image filename (or null), or undefined when the profile does not exist.
  async setImagePath(id, imagePath) {
    const row = store.adminProfiles.get(id);
    if (!row) return undefined;
    const previous = row.imagePath;
    row.imagePath = imagePath;
    row.updatedAt = now();
    return previous;
  },
  async findById(id) {
    const row = store.adminProfiles.get(id);
    return row ? clone(row) : null;
  },
  async findByPhone(normalizedPhone) {
    const row = [...store.adminProfiles.values()].find((a) => a.phoneNormalized === normalizedPhone);
    return row ? clone(row) : null;
  },
  async findByEmail(email) {
    const needle = email.toLowerCase();
    const row = [...store.adminProfiles.values()].find((a) => a.email.toLowerCase() === needle);
    return row ? clone(row) : null;
  },
  async remove(id) {
    store.adminProfiles.delete(id);
  },
  async touchLogin(id, at) {
    const row = store.adminProfiles.get(id);
    if (row) row.lastLoginAt = at;
  },
  // data: { firstName, lastName, phone, email, passwordHash, ... }
  async create(data) {
    const stamp = now();
    const row = { id: nextId('adminProfiles'), ...data, imagePath: null, createdAt: stamp, updatedAt: stamp };
    store.adminProfiles.set(row.id, row);
    return clone(row);
  },
  async setPasswordHash(id, passwordHash) {
    const row = store.adminProfiles.get(id);
    if (!row) return false;
    row.passwordHash = passwordHash;
    row.updatedAt = now();
    return true;
  },
};
