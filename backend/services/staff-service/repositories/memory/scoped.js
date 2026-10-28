// Small CRUD helper shared by the Staff Management in-memory repositories (temporary, see store.js).
// Every row carries accountId and shopId. Lookups need the caller's accountId, so a row of another account simply
// "does not exist" for the caller, and lists are always limited to one shop.
// `uniqueBy` (optional) names a text field that must be unique within a shop, ignoring case; a clash throws
// DuplicateError, checked in the same synchronous step as the write so two requests cannot both win.
const { store, nextId, clone, now } = require('./store');

// DuplicateError lives in repositories/errors.js (shared by both drivers); it is re-exported here for the services that import it from this file.
const { DuplicateError } = require('../errors');

function scoped(table, { uniqueBy } = {}) {
  const rows = () => store[table];
  const clash = (row, exceptId) => uniqueBy && [...rows().values()].some((o) => o.id !== exceptId && o.shopId === row.shopId
    && String(o[uniqueBy]).toLowerCase() === String(row[uniqueBy]).toLowerCase());

  return {
    async list(shopId) {
      return [...rows().values()].filter((r) => r.shopId === shopId).sort((a, b) => a.id - b.id).map(clone);
    },
    async find(accountId, id) {
      const row = rows().get(id);
      return row && row.accountId === accountId ? clone(row) : null;
    },
    async create(data) {
      if (clash(data)) throw new DuplicateError(uniqueBy);
      const stamp = now();
      const row = { ...data, id: nextId(table), createdAt: stamp, updatedAt: stamp };
      rows().set(row.id, row);
      return clone(row);
    },
    async update(id, patch) {
      const existing = rows().get(id);
      if (!existing) return null;
      const row = { ...existing, ...patch, id, updatedAt: now() };
      if (clash(row, id)) throw new DuplicateError(uniqueBy);
      rows().set(id, row);
      return clone(row);
    },
    async remove(id) {
      return rows().delete(id);
    },
  };
}

module.exports = { scoped, DuplicateError };
