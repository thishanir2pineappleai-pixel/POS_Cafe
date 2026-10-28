const { validate, notAnObject, isPlainObject } = require('@pos-cafe/shared/validate');
const { isBlank, toInt, toText } = require('@pos-cafe/shared/validator');
const { parsePagination } = require('@pos-cafe/shared/pagination');
const { parseDateOnly } = require('@pos-cafe/shared/date');
const { DISCOUNT_APPLICATION_STATUS } = require('../../config/constants/orders');

const STATUSES = Object.values(DISCOUNT_APPLICATION_STATUS);
const MAX_PRODUCTS = 10000; // PENDING: sanity limit

function parseStatus(raw, errors) {
  if (isBlank(raw)) return null;
  if (!STATUSES.includes(raw)) { errors.push({ field: 'status', message: `Must be one of: ${STATUSES.join(', ')}` }); return null; }
  return raw;
}

// POST and PUT /discounts/applications body.
// { discountId, startDate, endDate, status?, appliesToAll, productIds? }
// PENDING APPROVAL: start and end may be the same day; applications of one discount may overlap; at least one product
// is required when appliesToAll is false (the Figma flow offers "All Products" or "Select Products").
function parseApplicationBody(req) {
  const body = req.body;
  if (!isPlainObject(body)) return notAnObject();
  const errors = [];

  const discountId = toInt(body.discountId, { min: 1 });
  if (discountId === null) errors.push({ field: 'discountId', message: isBlank(body.discountId) ? 'Required' : 'Must be a positive whole number' });

  const startDate = parseDateOnly(body.startDate);
  const endDate = parseDateOnly(body.endDate);
  if (startDate === null) errors.push({ field: 'startDate', message: isBlank(body.startDate) ? 'Required' : 'Must be a real date as YYYY-MM-DD' });
  if (endDate === null) errors.push({ field: 'endDate', message: isBlank(body.endDate) ? 'Required' : 'Must be a real date as YYYY-MM-DD' });
  if (startDate && endDate && startDate > endDate) errors.push({ field: 'endDate', message: 'Must not be before startDate' });

  const status = parseStatus(body.status, errors);

  let appliesToAll = null;
  let productIds = [];
  if (typeof body.appliesToAll !== 'boolean') {
    errors.push({ field: 'appliesToAll', message: 'Required: true for All Products, false for selected products' });
  } else {
    appliesToAll = body.appliesToAll;
    const raw = body.productIds;
    if (appliesToAll) {
      if (!isBlank(raw) && !(Array.isArray(raw) && raw.length === 0)) errors.push({ field: 'productIds', message: 'Must be empty when appliesToAll is true' });
    } else if (!Array.isArray(raw) || raw.length === 0) {
      errors.push({ field: 'productIds', message: 'Select at least one product' });
    } else if (raw.length > MAX_PRODUCTS) {
      errors.push({ field: 'productIds', message: `At most ${MAX_PRODUCTS} products` });
    } else {
      productIds = raw.map((id) => toInt(id, { min: 1 }));
      if (productIds.includes(null)) errors.push({ field: 'productIds', message: 'Every id must be a positive whole number' });
      else if (new Set(productIds).size !== productIds.length) errors.push({ field: 'productIds', message: 'A product is listed twice' });
    }
  }
  return { value: { discountId, startDate, endDate, status, appliesToAll, productIds }, errors };
}

// PATCH /discounts/applications/:id/status body
function parseStatusBody(req) {
  const errors = [];
  const status = isPlainObject(req.body) ? parseStatus(req.body.status, errors) : null;
  if (status === null && errors.length === 0) errors.push({ field: 'status', message: `Required: one of ${STATUSES.join(', ')}` });
  return { value: { status }, errors };
}

// GET /discounts/applications query
function parseApplicationQuery(req) {
  const errors = [];
  let search = null;
  if (req.query.search !== undefined && req.query.search !== '') {
    search = toText(req.query.search, { max: 100 });
    if (!search) errors.push({ field: 'search', message: 'Must be at most 100 characters' });
  }
  const pagination = parsePagination(req.query);
  errors.push(...pagination.errors);
  return { value: { search, page: pagination.page, limit: pagination.limit }, errors };
}

module.exports = {
  validateApplicationBody: validate(parseApplicationBody, 'body'),
  validateApplicationStatusBody: validate(parseStatusBody, 'body'),
  validateApplicationQuery: validate(parseApplicationQuery, 'query'),
};
