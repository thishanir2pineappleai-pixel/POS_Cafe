// In-memory discount DEFINITION repository (name and percentage only; temporary, see store.js).
// Sales discount applications (periods, status, products) are not part of this stage.
const { store, nextId, clone, now } = require('./store');
const { sameName } = require('../../utils/helper');

module.exports = {
  async list() {
    return [...store.discounts.values()].map(clone);
  },
  async findById(id) {
    const row = store.discounts.get(id);
    return row ? clone(row) : null;
  },
  async findByName(name) {
    const row = [...store.discounts.values()].find((d) => sameName(d.name, name));
    return row ? clone(row) : null;
  },
  async create({ name, percentage }) {
    const row = { id: nextId('discounts'), name, percentage, createdAt: now() };
    store.discounts.set(row.id, row);
    return clone(row);
  },
};
