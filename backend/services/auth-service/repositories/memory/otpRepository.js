// In-memory store for one-time codes and password-reset tokens (temporary, see store.js). Only keyed HASHES are kept,
// never a code or token itself. One row: { id, purpose, subject, hash, expiresAt, attempts, usedAt, invalidatedAt, createdAt }.
const { store, nextId, clone } = require('./store');

const same = (r, purpose, subject) => r.purpose === purpose && r.subject === subject;

module.exports = {
  async create(record) {
    const row = { id: nextId('otps'), attempts: 0, usedAt: null, invalidatedAt: null, ...record };
    store.otps.set(row.id, row);
    return clone(row);
  },
  // Every row ever issued for this purpose and subject, oldest first (used for resend limits).
  async history(purpose, subject) {
    return [...store.otps.values()].filter((r) => same(r, purpose, subject)).map(clone);
  },
  // The newest row that has not been used or invalidated.
  async latestActive(purpose, subject) {
    const rows = [...store.otps.values()].filter((r) => same(r, purpose, subject) && !r.usedAt && !r.invalidatedAt);
    return rows.length ? clone(rows[rows.length - 1]) : null;
  },
  async findActiveByHash(purpose, hash) {
    const row = [...store.otps.values()].find((r) => r.purpose === purpose && r.hash === hash && !r.usedAt && !r.invalidatedAt);
    return row ? clone(row) : null;
  },
  async update(id, patch) {
    const row = store.otps.get(id);
    if (!row) return null;
    // Only the counters and times can change (same as the Prisma repository): never the purpose, subject or hash.
    for (const f of ['attempts', 'usedAt', 'invalidatedAt']) if (patch[f] !== undefined) row[f] = patch[f];
    return clone(row);
  },
  async invalidateActive(purpose, subject, at) {
    for (const r of store.otps.values()) if (same(r, purpose, subject) && !r.usedAt && !r.invalidatedAt) r.invalidatedAt = at;
  },
};
