// TEMPORARY IN-MEMORY STORAGE of the Sales Service (development default, no database needed).
//
//   * Everything here is LOST WHEN THE SERVICE RESTARTS. Nothing is seeded: every collection starts empty.
//   * Other services' data (accounts, shops, products, discount definitions) is referenced by id only, never copied or joined;
//     names and prices are copied into the rows when they are saved, exactly as the MySQL tables do.
const clock = require('@pos-cafe/shared/clock');

const emptyStore = () => ({
  // id -> { id, accountId, shopId, orderNumber, type, status, customerId, customerName, tableLabel, subtotal, discountTotal, total,
  //         placedAt, items: [{ productId, name, unitPrice, quantity, discountPercentage, discountAmount, discountApplicationId }],
  //         createdAt, updatedAt }
  orders: new Map(),
  // id -> { id, accountId, discountId, discountName, discountPercentage, startDate, endDate, status, appliesToAll, productIds, createdAt, updatedAt }
  discountApplications: new Map(),
  lastId: { orders: 0, discountApplications: 0 },
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
