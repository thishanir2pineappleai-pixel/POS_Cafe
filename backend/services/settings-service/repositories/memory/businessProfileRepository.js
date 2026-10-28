// In-memory SHOP profile repository (the Business Profile; temporary, see store.js: lost on restart, starts empty).
// Same method names the future MySQL repository will offer.
const { store, nextId, clone, now } = require('./store');

module.exports = {
  async list() {
    return [...store.shopProfiles.values()].sort((a, b) => b.id - a.id).map(clone); // newest first
  },
  // Shops of one account only.
  async listByAccount(accountId) {
    return [...store.shopProfiles.values()].filter((s) => s.accountId === accountId).sort((a, b) => b.id - a.id).map(clone);
  },
  async findById(id) {
    const row = store.shopProfiles.get(id);
    return row ? clone(row) : null;
  },
  // data: { name, address, phone, email, website, timezone }
  async create(data) {
    const stamp = now();
    const row = { id: nextId('shopProfiles'), ...data, imagePath: null, createdAt: stamp, updatedAt: stamp };
    store.shopProfiles.set(row.id, row);
    return clone(row);
  },
  async update(id, data) {
    const existing = store.shopProfiles.get(id);
    if (!existing) return null;
    // Only the text fields can change here (same as the Prisma repository): never the account, owner or image.
    const text = Object.fromEntries(['name', 'address', 'phone', 'email', 'website', 'timezone'].filter((f) => data[f] !== undefined).map((f) => [f, data[f]]));
    const row = { ...existing, ...text, updatedAt: now() };
    store.shopProfiles.set(id, row);
    return clone(row);
  },
  // Returns the previous image filename (or null), or undefined when the profile does not exist.
  async setImagePath(id, imagePath) {
    const row = store.shopProfiles.get(id);
    if (!row) return undefined;
    const previous = row.imagePath;
    row.imagePath = imagePath;
    row.updatedAt = now();
    return previous;
  },
};
