const { validate, notAnObject, isPlainObject } = require('@pos-cafe/shared/validate');
const { isBlank, toInt, toText } = require('@pos-cafe/shared/validator');
const { parsePagination } = require('@pos-cafe/shared/pagination');
const { parseDateOnly } = require('@pos-cafe/shared/date');
const { ORDER_TYPES, ORDER_STATUS, PAYMENT_METHODS, STATUS_TRANSITIONS, LIMITS } = require('../../config/constants/orders');

// An optional positive whole number from a query or body field; null when absent, undefined-safe errors pushed.
function optionalId(raw, field, errors) {
  if (isBlank(raw)) return null;
  const id = toInt(raw, { min: 1 });
  if (id === null) errors.push({ field, message: 'Must be a positive whole number' });
  return id;
}

// Filters shared by the order list, the CSV export and the sales summary, so all three always agree.
// from / to are 'YYYY-MM-DD' and inclusive. A single day is from = to. Neither given means every date
// (the Figma defaults to "Today", but the frontend sends that day explicitly). shopId (optional) limits to one shop.
function readFilters(query, errors, { withSearch }) {
  const value = { from: null, to: null, search: null, shopId: null };
  for (const field of ['from', 'to']) {
    if (isBlank(query[field])) continue;
    value[field] = parseDateOnly(query[field]);
    if (value[field] === null) errors.push({ field, message: 'Must be a real date as YYYY-MM-DD' });
  }
  if (value.from && value.to && value.from > value.to) errors.push({ field: 'to', message: 'Must not be before from' });
  if (withSearch && !isBlank(query.search)) {
    value.search = toText(query.search, { max: 100 });
    if (!value.search) errors.push({ field: 'search', message: 'Must be at most 100 characters' });
  }
  value.shopId = optionalId(query.shopId, 'shopId', errors);
  return value;
}

// GET /orders?from&to&search&shopId&page&limit
function parseOrderQuery(req) {
  const errors = [];
  const filters = readFilters(req.query, errors, { withSearch: true });
  const pagination = parsePagination(req.query);
  errors.push(...pagination.errors);
  return { value: { ...filters, page: pagination.page, limit: pagination.limit }, errors };
}

// GET /orders/export?from&to&search&shopId&format
// The Figma menu offers .pdf, .csv and .xls; only csv is implemented (the others answer 501).
const EXPORT_FORMATS = ['csv', 'pdf', 'xls'];
function parseExportQuery(req) {
  const errors = [];
  const filters = readFilters(req.query, errors, { withSearch: true });
  const format = isBlank(req.query.format) ? 'csv' : req.query.format;
  if (!EXPORT_FORMATS.includes(format)) errors.push({ field: 'format', message: `Must be one of: ${EXPORT_FORMATS.join(', ')}` });
  return { value: { ...filters, format }, errors };
}

// GET /reports/sales/summary?from&to&shopId
function parseSummaryQuery(req) {
  const errors = [];
  const { from, to, shopId } = readFilters(req.query, errors, { withSearch: false });
  return { value: { from, to, shopId }, errors };
}

// GET /dashboard/*?date&period&shopId&limit. `date` defaults to today on the server; the other fields to nothing / today.
// PENDING: default limits (top selling 4, recent orders 5, stock items 4) copy the number of rows drawn in the design.
const PERIODS = ['today', 'week', 'month'];
function parseDashboardQuery(req) {
  const errors = [];
  const q = req.query;
  const date = isBlank(q.date) ? null : parseDateOnly(q.date);
  if (!isBlank(q.date) && date === null) errors.push({ field: 'date', message: 'Must be a real date as YYYY-MM-DD' });
  const period = isBlank(q.period) ? 'today' : q.period;
  if (!PERIODS.includes(period)) errors.push({ field: 'period', message: `Must be one of: ${PERIODS.join(', ')}` });
  let limit = null;
  if (!isBlank(q.limit)) {
    limit = toInt(q.limit, { min: 1, max: 20 });
    if (limit === null) errors.push({ field: 'limit', message: 'Must be a whole number from 1 to 20' });
  }
  return { value: { date, period, shopId: optionalId(q.shopId, 'shopId', errors), limit }, errors };
}

// POST and PUT /orders body: { type, customerName?, tableLabel?, shopId?, items: [{ productId, quantity }] }.
// Prices, discounts, totals and the status are NEVER read from the body: the service calculates them.
function parseOrderBody(req) {
  const body = req.body;
  if (!isPlainObject(body)) return notAnObject();
  const errors = [];

  const type = Object.values(ORDER_TYPES).includes(body.type) ? body.type : null;
  if (type === null) errors.push({ field: 'type', message: isBlank(body.type) ? 'Required' : `Must be one of: ${Object.values(ORDER_TYPES).join(', ')}` });

  let customerName = null;
  if (!isBlank(body.customerName)) {
    customerName = toText(body.customerName, { max: 100 });
    if (!customerName) errors.push({ field: 'customerName', message: 'Must be text of 1-100 characters' });
  }

  let tableLabel = null;
  if (!isBlank(body.tableLabel)) {
    tableLabel = toText(body.tableLabel, { max: 30 });
    if (!tableLabel) errors.push({ field: 'tableLabel', message: 'Must be text of 1-30 characters' });
    else if (type === ORDER_TYPES.TAKE_AWAY) errors.push({ field: 'tableLabel', message: 'Only a Dine-In order has a table' });
  }

  const shopId = optionalId(body.shopId, 'shopId', errors);

  const items = [];
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push({ field: 'items', message: 'Add at least one item' });
  } else if (body.items.length > LIMITS.maxLines) {
    errors.push({ field: 'items', message: `At most ${LIMITS.maxLines} items` });
  } else {
    const seen = new Set();
    body.items.forEach((raw, i) => {
      const where = `items[${i}]`;
      if (!isPlainObject(raw)) { errors.push({ field: where, message: 'Must be an object with productId and quantity' }); return; }
      const productId = typeof raw.productId === 'number' ? toInt(raw.productId, { min: 1 }) : null;
      const quantity = typeof raw.quantity === 'number' ? toInt(raw.quantity, { min: 1, max: LIMITS.maxQuantity }) : null;
      if (productId === null) errors.push({ field: `${where}.productId`, message: 'Must be a positive whole number' });
      else if (seen.has(productId)) errors.push({ field: `${where}.productId`, message: 'A product is listed twice: send one line with the total quantity' });
      else seen.add(productId);
      if (quantity === null) errors.push({ field: `${where}.quantity`, message: `Must be a whole number from 1 to ${LIMITS.maxQuantity}` });
      if (productId !== null && quantity !== null) items.push({ productId, quantity });
    });
  }
  return { value: { type, customerName, tableLabel, shopId, items }, errors };
}

// PATCH /orders/:id/status body: { status }. Only the barista's targets are accepted: Paid comes from recording a payment and
// Cancelled has no rule yet (see config/constants/orders.js), so both answer 400 with an explanation.
const STATUS_TARGETS = [...new Set(Object.values(STATUS_TRANSITIONS).flat())];
function parseStatusBody(req) {
  if (!isPlainObject(req.body)) return notAnObject();
  const { status } = req.body;
  if (STATUS_TARGETS.includes(status)) return { value: { status }, errors: [] };
  let message = `Must be one of: ${STATUS_TARGETS.join(', ')}`;
  if (status === ORDER_STATUS.PAID) message = 'An order becomes Paid when its payment is recorded (POST /orders/:id/payments)';
  if (status === ORDER_STATUS.CANCELLED) message = 'Cancelling orders is not available: its rules are not defined yet';
  return { value: null, errors: [{ field: 'status', message: isBlank(status) ? 'Required' : message }] };
}

// POST /orders/:id/payments body: { method: "Cash" | "Card" }. The amount is not accepted: it is the order total.
function parsePaymentBody(req) {
  if (!isPlainObject(req.body)) return notAnObject();
  const { method } = req.body;
  if (Object.values(PAYMENT_METHODS).includes(method)) return { value: { method }, errors: [] };
  return { value: null, errors: [{ field: 'method', message: isBlank(method) ? 'Required' : `Must be one of: ${Object.values(PAYMENT_METHODS).join(', ')}` }] };
}

module.exports = {
  validateStatusBody: validate(parseStatusBody, 'body'),
  validatePaymentBody: validate(parsePaymentBody, 'body'),
  validateOrderQuery: validate(parseOrderQuery, 'query'),
  validateExportQuery: validate(parseExportQuery, 'query'),
  validateSummaryQuery: validate(parseSummaryQuery, 'query'),
  validateDashboardQuery: validate(parseDashboardQuery, 'query'),
  validateOrderBody: validate(parseOrderBody, 'body'),
};
