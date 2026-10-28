// In-memory STAFF repository (temporary, see store.js: lost on restart, starts empty, never seeded).
// Same method names the future MySQL repository will offer. In MySQL the duplicate rules below become UNIQUE keys
// (shop_id + email, shop_id + phone_normalized, shop_id + nic, shop_id + code_number, account_id + username) and the
// create/update below one transaction together with the roster rows.
//
// Removed staff are only marked (deletedAt): they disappear from every list and lookup, but their values stay reserved,
// so the same email, phone, NIC or code cannot be reused while the record can still be restored.
const { store, nextId, clone, now } = require('./store');
const { DuplicateError } = require('./scoped');

function findDuplicate(row, exceptId) {
  for (const other of store.staff.values()) {
    if (other.id === exceptId) continue;
    if (other.accountId === row.accountId && other.usernameKey === row.usernameKey) return 'username';
    if (other.shopId !== row.shopId) continue;
    if (other.email === row.email) return 'email';
    if (other.phoneNormalized === row.phoneNormalized) return 'phone';
    if (other.nic === row.nic) return 'nic';
  }
  return null;
}

const visible = (row) => row && !row.deletedAt;

module.exports = {
  // Staff of one shop (not removed ones), newest first.
  async list(shopId) {
    return [...store.staff.values()].filter((s) => s.shopId === shopId && !s.deletedAt).sort((a, b) => b.id - a.id).map(clone);
  },
  // A staff member of the caller's account. Removed staff are only found with { withRemoved: true }.
  async findById(accountId, id, { withRemoved = false } = {}) {
    const row = store.staff.get(id);
    if (!row || row.accountId !== accountId) return null;
    return withRemoved || visible(row) ? clone(row) : null;
  },
  // data holds every column except id/code/timestamps. `rosterDays` is stored with it as one unit.
  async create(data, rosterDays) {
    const duplicate = findDuplicate(data, null);
    if (duplicate) throw new DuplicateError(duplicate);
    const codeNumber = Math.max(0, ...[...store.staff.values()].filter((s) => s.shopId === data.shopId).map((s) => s.codeNumber)) + 1;
    const stamp = now();
    const row = {
      ...data, id: nextId('staff'), codeNumber, code: `STF${String(codeNumber).padStart(4, '0')}`, deletedAt: null, createdAt: stamp, updatedAt: stamp,
    };
    store.staff.set(row.id, row);
    store.roster.set(row.id, { ...rosterDays });
    return clone(row);
  },
  async update(id, patch, rosterDays) {
    const existing = store.staff.get(id);
    if (!existing) return null;
    const row = { ...existing, ...patch, id, updatedAt: now() };
    const duplicate = findDuplicate(row, id);
    if (duplicate) throw new DuplicateError(duplicate);
    store.staff.set(id, row);
    if (rosterDays) store.roster.set(id, { ...rosterDays });
    return clone(row);
  },
  async setRemoved(id, removedAt) {
    const row = store.staff.get(id);
    if (!row) return null;
    row.deletedAt = removedAt;
    row.updatedAt = now();
    return clone(row);
  },
  // Returns the previous file name (or null).
  async setImagePath(id, imagePath) {
    const row = store.staff.get(id);
    if (!row) return undefined; // same as the Prisma repository
    const previous = row.imagePath;
    row.imagePath = imagePath;
    row.updatedAt = now();
    return previous;
  },
  // type: 'cv' | 'idCopy' | 'agreement'. Returns the previous document (or null).
  async setDocument(id, type, doc) {
    const row = store.staff.get(id);
    const previous = row.documents[type];
    row.documents = { ...row.documents, [type]: doc };
    row.updatedAt = now();
    return previous;
  },
  // How many staff (removed ones included) still use a role, team or shift: those cannot be deleted.
  async countUsing(shopId, field, value) {
    return [...store.staff.values()].filter((s) => s.shopId === shopId && s[field] === value).length;
  },
};
