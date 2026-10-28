// TEMPORARY IN-MEMORY STORAGE of the Menu Service (development default, no database needed).
//
//   * Every product, category, ingredient and discount definition lives in these Maps.
//   * ALL DATA IS LOST WHEN THE SERVICE RESTARTS. Nothing is seeded: every collection starts empty.
//   * Uploaded photo FILES are written to services/menu-service/uploads/products and are NOT lost on restart, but the
//     products that reference them are, so old files become orphans until database persistence exists.
//
// When Prisma/MySQL is configured (REPOSITORY_DRIVER=prisma), repositories/index.js selects the database repositories
// (same method names) instead. Services and controllers never touch this file.
const clock = require('@pos-cafe/shared/clock');

const emptyStore = () => ({
  categories: new Map(), // id -> { id, name, createdAt }
  discounts: new Map(), // id -> { id, name, percentage, createdAt }
  ingredients: new Map(), // id -> { id, name, createdAt }
  products: new Map(), // id -> product row (foreign keys as ids, like the future SQL columns)
  productIngredients: new Map(), // productId -> [{ ingredientId, quantity }]
  lastId: { categories: 0, discounts: 0, ingredients: 0, products: 0 },
});

const store = emptyStore();

function nextId(table) {
  store.lastId[table] += 1;
  return store.lastId[table];
}

// Used by the automated tests to start from empty collections.
function reset() {
  Object.assign(store, emptyStore());
  clock.reset();
}

const clone = (value) => structuredClone(value);
const now = () => new Date().toISOString();

module.exports = { store, nextId, reset, clone, now };
