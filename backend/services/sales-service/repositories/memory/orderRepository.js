// In-memory order repository (temporary, see store.js: all data is lost on restart). Same methods and row shape as
// repositories/prisma/orderRepository.js. Every query is limited to ONE account (and optionally one shop).
// Money is stored as plain numbers with 2 decimals (calculated in whole cents by services/order/pricing.js).
const { store, nextId, clone, now } = require('./store');
const { dateOf, inDateRange, timeLabel } = require('@pos-cafe/shared/date');
const { formatItemsText } = require('../../utils/formatter');

const searchableText = (o) => [o.orderNumber, o.type, o.customerName, formatItemsText(o.items), o.status, timeLabel(o.placedAt)];

// Newest first (the order shown in the Figma table is assumed to be newest first: PENDING APPROVAL).
const newestFirst = (a, b) => (a.placedAt < b.placedAt ? 1 : a.placedAt > b.placedAt ? -1 : b.id - a.id);

// shopId is optional: without it every shop of the account is included.
function matching({ accountId, shopId, from, to, search }) {
  const needle = search ? search.toLowerCase() : null;
  return [...store.orders.values()]
    .filter((o) => o.accountId === accountId)
    .filter((o) => shopId === undefined || shopId === null || o.shopId === shopId)
    .filter((o) => inDateRange(dateOf(o.placedAt), { from, to }))
    .filter((o) => !needle || searchableText(o).some((text) => text && text.toLowerCase().includes(needle)))
    .sort(newestFirst);
}

module.exports = {
  // data: { accountId, shopId, type, status, customerName, tableLabel, subtotal, discountTotal, total, placedAt, items }
  // The order number is #ORD<id> (unique because the id is). With MySQL: one transaction creates the order, its lines and the number.
  async create(data) {
    const id = nextId('orders');
    const stamp = now();
    const order = {
      customerId: null, customerName: null, tableLabel: null, payment: null, ...data, id, orderNumber: `#ORD${id}`, items: data.items.map((i) => ({ ...i })), createdAt: stamp, updatedAt: stamp,
    };
    store.orders.set(id, order);
    return clone(order);
  },

  async findById(id, { accountId }) {
    const order = store.orders.get(id);
    return order && order.accountId === accountId ? clone(order) : null;
  },

  // Replaces type, customer, table, the money columns and ALL lines; null when the order does not exist in this account or,
  // when `status` is given, no longer has that status.
  async update(id, { accountId, status }, data) {
    const existing = store.orders.get(id);
    if (!existing || existing.accountId !== accountId || (status && existing.status !== status)) return null;
    const order = { ...existing, ...data, items: data.items.map((i) => ({ ...i })), updatedAt: now() };
    store.orders.set(id, order);
    return clone(order);
  },

  // Moves the order from one status to another only if it still has the `from` status (so two requests cannot both win);
  // null when the order does not exist in this account or its status is no longer `from`.
  async transition(id, { accountId }, { from, to }) {
    const order = store.orders.get(id);
    if (!order || order.accountId !== accountId || order.status !== from) return null;
    order.status = to;
    order.updatedAt = now();
    return clone(order);
  },

  // Records the payment and sets the status to `to` in one step, only if the order still has the `from` status; null otherwise.
  // With MySQL this is one transaction: the guarded status update and the payment row succeed or fail together.
  // payment: { method, amount, paidAt, recordedBy }
  async pay(id, { accountId }, { from, to, payment }) {
    const order = store.orders.get(id);
    if (!order || order.accountId !== accountId || order.status !== from || order.payment) return null;
    order.status = to;
    order.payment = { ...payment };
    order.updatedAt = now();
    return clone(order);
  },

  // filters: { accountId, shopId?, from, to, search } (dates 'YYYY-MM-DD', inclusive; all but accountId optional)
  async list({ offset, limit, ...filters }) {
    const rows = matching(filters);
    return { total: rows.length, rows: rows.slice(offset, offset + limit).map(clone) };
  },

  // Every matching row, no paging (summary numbers and the CSV export use the same filters as the list).
  async findAll(filters) {
    return matching(filters).map(clone);
  },

  // Newest orders first for ONE shop.
  async recent({ accountId, shopId, limit }) {
    return matching({ accountId, shopId }).slice(0, limit).map(clone);
  },

  // PENDING APPROVAL: a "new customer" is a customerId whose very first order (any status) falls inside the range.
  // Orders without a customerId can not be counted, and no API sets one yet (there is no Customer data), so this is 0 today.
  async countNewCustomers({ accountId, shopId, from, to }) {
    const firstOrder = new Map();
    for (const o of store.orders.values()) {
      if (o.accountId !== accountId || o.customerId === null || o.customerId === undefined) continue;
      if (shopId !== undefined && shopId !== null && o.shopId !== shopId) continue;
      const date = dateOf(o.placedAt);
      if (!firstOrder.has(o.customerId) || date < firstOrder.get(o.customerId)) firstOrder.set(o.customerId, date);
    }
    return [...firstOrder.values()].filter((date) => inDateRange(date, { from, to })).length;
  },
};
