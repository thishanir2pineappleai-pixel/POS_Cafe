// In-memory ingredient repository (temporary, see store.js). Ingredients are only an id and a name.
const { store, nextId, clone, now } = require('./store');
const { sameName } = require('../../utils/helper');

const SEARCH_LIMIT = 50;

module.exports = {
  async search(term) {
    const needle = term ? term.toLowerCase() : '';
    return [...store.ingredients.values()]
      .filter((i) => !needle || i.name.toLowerCase().includes(needle))
      .slice(0, SEARCH_LIMIT)
      .map(clone);
  },
  async findById(id) {
    const row = store.ingredients.get(id);
    return row ? clone(row) : null;
  },
  async findByName(name) {
    const row = [...store.ingredients.values()].find((i) => sameName(i.name, name));
    return row ? clone(row) : null;
  },
  async create(name) {
    const row = { id: nextId('ingredients'), name, createdAt: now() };
    store.ingredients.set(row.id, row);
    return clone(row);
  },
  // Used when a product lists an ingredient name that does not exist yet.
  async findOrCreateByName(name) {
    return (await this.findByName(name)) ?? (await this.create(name));
  },
};
