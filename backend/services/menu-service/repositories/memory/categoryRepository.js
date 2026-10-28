// In-memory category repository (temporary, see store.js). Same method names as the future MySQL version.
const { store, nextId, clone, now } = require('./store');
const { sameName } = require('../../utils/helper');

module.exports = {
  async list() {
    return [...store.categories.values()].map(clone); // creation order
  },
  async count() {
    return store.categories.size;
  },
  async findById(id) {
    const row = store.categories.get(id);
    return row ? clone(row) : null;
  },
  async findByName(name) {
    const row = [...store.categories.values()].find((c) => sameName(c.name, name));
    return row ? clone(row) : null;
  },
  async create(name) {
    const row = { id: nextId('categories'), name, createdAt: now() };
    store.categories.set(row.id, row);
    return clone(row);
  },
};
