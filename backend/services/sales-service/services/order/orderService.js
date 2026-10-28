// Orders: list, CSV export, read, create and edit. Every call works on the caller's own account (and, for orders, a shop of
// that account). Prices come from the Menu Service and are copied into the order; totals are calculated here, never taken
// from the client (see pricing.js for the rules). The lifecycle is in config/constants/orders.js: the barista moves an order
// Pending -> Preparing -> Delivered, and recording a payment on a Delivered order makes it Paid. There is NO cancellation or
// refund: no document defines them (see README.md).
const { orderRepository, discountApplicationRepository } = require('../../repositories');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { buildMeta } = require('@pos-cafe/shared/pagination');
const clock = require('@pos-cafe/shared/clock');
const { dateOf, localDateTime, timeLabel } = require('@pos-cafe/shared/date');
const { toCsv } = require('@pos-cafe/shared/csv');
const { MESSAGES } = require('../../config/constants/messages');
const { INITIAL_ORDER_STATUS, ORDER_STATUS, STATUS_TRANSITIONS, PAYABLE_STATUS, LIMITS } = require('../../config/constants/orders');
const { formatItemsText } = require('../../utils/formatter');
const menuClient = require('../integration/menuClient');
const shopScope = require('../shopScope');
const { priceOrder } = require('./pricing');

const CSV_HEADERS = ['Order ID', 'Order Type', 'Customer', 'Items', 'Total', 'Status', 'Time', 'Date'];

const invalid = (errors, message = MESSAGES.VALIDATION_FAILED) => new AppError(400, ERROR_CODES.VALIDATION_ERROR, message, errors);
const notFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.ORDER_NOT_FOUND);

function toDto(o) {
  return {
    id: o.id,
    orderId: o.orderNumber,
    shopId: o.shopId,
    type: o.type,
    customer: o.customerName,
    tableLabel: o.tableLabel,
    items: o.items,
    itemsText: formatItemsText(o.items),
    subtotal: o.subtotal,
    discountTotal: o.discountTotal,
    total: o.total,
    status: o.status,
    payment: o.payment ?? null,
    time: timeLabel(o.placedAt),
    date: dateOf(o.placedAt),
    placedAt: o.placedAt,
  };
}

// filters: { from, to, search, shopId? }
async function scopeOf(auth, filters) {
  const shopId = await shopScope.checkShop(auth, filters.shopId);
  return { accountId: auth.accountId, shopId, from: filters.from, to: filters.to, search: filters.search };
}

async function list(auth, { page, limit, ...filters }) {
  const { rows, total } = await orderRepository.list({ ...(await scopeOf(auth, filters)), offset: (page - 1) * limit, limit });
  return { items: rows.map(toDto), meta: buildMeta(total, page, limit) };
}

// Same filters as list(), but every matching row (not one page).
async function exportCsv(auth, filters) {
  const rows = (await orderRepository.findAll(await scopeOf(auth, filters))).map(toDto);
  return toCsv(CSV_HEADERS, rows.map((o) => [o.orderId, o.type, o.customer, o.itemsText, o.total, o.status, o.time, o.date]));
}

async function get(auth, id) {
  const order = await orderRepository.findById(id, { accountId: auth.accountId });
  if (!order) throw notFound();
  return toDto(order);
}

// Looks up the products and the applications that are active on the order date, then prices the lines.
async function price(auth, lines, orderDate) {
  const ids = lines.map((l) => l.productId);
  const found = await menuClient.lookupProducts(ids);
  const productsById = new Map(found.map((p) => [p.id, p]));
  const missing = [...new Set(ids)].filter((id) => !productsById.has(id));
  if (missing.length) throw invalid([{ field: 'items', message: `Products do not exist: ${missing.join(', ')}` }]);
  const applications = await discountApplicationRepository.findActiveOn({ accountId: auth.accountId, date: orderDate });
  const priced = priceOrder(lines, productsById, applications.sort((a, b) => a.id - b.id));
  if (priced.totalCents > LIMITS.maxTotalCents || priced.subtotalCents > LIMITS.maxTotalCents) throw invalid([{ field: 'items', message: MESSAGES.ORDER_TOO_LARGE }], MESSAGES.ORDER_TOO_LARGE);
  return priced;
}

// body: { type, customerName, tableLabel, shopId, items: [{ productId, quantity }] }
async function create(auth, body) {
  const shopId = await shopScope.requireShop(auth, body.shopId ?? undefined);
  const placedAt = localDateTime(clock.now());
  const priced = await price(auth, body.items, dateOf(placedAt));
  const order = await orderRepository.create({
    accountId: auth.accountId,
    shopId,
    type: body.type,
    status: INITIAL_ORDER_STATUS,
    customerName: body.customerName,
    tableLabel: body.tableLabel,
    subtotal: priced.subtotal,
    discountTotal: priced.discountTotal,
    total: priced.total,
    placedAt,
    items: priced.items,
  });
  return toDto(order);
}

// Replaces type, customer, table and ALL lines (add, change or remove lines by sending the new list) and prices the order
// again with the current Menu prices. PROVISIONAL RULE (pending approval): only a Pending order can be changed.
async function update(auth, id, body) {
  const existing = await orderRepository.findById(id, { accountId: auth.accountId });
  if (!existing) throw notFound();
  if (existing.status !== ORDER_STATUS.PENDING) throw new AppError(409, ERROR_CODES.CONFLICT, MESSAGES.ORDER_NOT_EDITABLE);
  const priced = await price(auth, body.items, dateOf(existing.placedAt));
  // The repository repeats the Pending check inside the update itself: the order may have moved on while it was being priced.
  const order = await orderRepository.update(id, { accountId: auth.accountId, status: ORDER_STATUS.PENDING }, {
    type: body.type,
    customerName: body.customerName,
    tableLabel: body.tableLabel,
    subtotal: priced.subtotal,
    discountTotal: priced.discountTotal,
    total: priced.total,
    items: priced.items,
  });
  if (!order) throw new AppError(409, ERROR_CODES.CONFLICT, MESSAGES.ORDER_CHANGED);
  return toDto(order);
}

const conflict = (message) => new AppError(409, ERROR_CODES.CONFLICT, message);

// The barista's steps (BRD BR-04). `status` was validated to be one of the targets in STATUS_TRANSITIONS.
async function setStatus(auth, id, status) {
  const scope = { accountId: auth.accountId };
  const existing = await orderRepository.findById(id, scope);
  if (!existing) throw notFound();
  if (!(STATUS_TRANSITIONS[existing.status] ?? []).includes(status)) {
    throw new AppError(409, ERROR_CODES.CONFLICT, MESSAGES.ORDER_TRANSITION_REFUSED, [{ field: 'status', message: `${existing.status} -> ${status} is not allowed` }]);
  }
  const order = await orderRepository.transition(id, scope, { from: existing.status, to: status });
  if (!order) throw conflict(MESSAGES.ORDER_CHANGED);
  return toDto(order);
}

// Records the payment of a Delivered order (BRD BR-05: cash or card upon completion) and makes it Paid, in one step.
// The amount is ALWAYS the order total (no partial or split payments: no rule), never taken from the client. No payment
// provider is called and no card data is handled: only the method is recorded.
async function pay(auth, id, { method }) {
  const scope = { accountId: auth.accountId };
  const existing = await orderRepository.findById(id, scope);
  if (!existing) throw notFound();
  if (existing.status === ORDER_STATUS.PAID || existing.payment) throw conflict(MESSAGES.ORDER_ALREADY_PAID);
  if (existing.status !== PAYABLE_STATUS) throw conflict(MESSAGES.ORDER_NOT_PAYABLE);
  const order = await orderRepository.pay(id, scope, {
    from: PAYABLE_STATUS,
    to: ORDER_STATUS.PAID,
    payment: { method, amount: existing.total, paidAt: localDateTime(clock.now()), recordedBy: auth.userId },
  });
  if (!order) throw conflict(MESSAGES.ORDER_CHANGED);
  return toDto(order);
}

module.exports = { list, exportCsv, get, create, update, setStatus, pay, toDto };
