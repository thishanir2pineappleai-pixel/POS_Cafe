const { STATUS_FILTERS } = require('../../config/constants/status');
const { isBlank, isPlainObject, toAmount, toInt, toText } = require('@pos-cafe/shared/validator');
const { parsePagination } = require('@pos-cafe/shared/pagination');
const { validate } = require('@pos-cafe/shared/validate');

// Field rules for products. Only the two "optional" rules below are CONFIRMED by the owner/Figma.
// Everything marked PENDING is a provisional choice that must be approved; change it here, in one place.
const RULES = {
  name: { required: true, max: 150 }, // PENDING: required, max length
  categoryId: { required: true }, // PENDING: required
  costPrice: { required: false }, // CONFIRMED optional
  sellingPrice: { required: true }, // PENDING: required
  quantity: { required: true }, // PENDING: required
  lowStockAlert: { required: false }, // PENDING: required? No default is assumed.
  discountId: { required: false }, // CONFIRMED optional
  ingredients: { maxItems: 100, nameMax: 100, quantityMax: 50 }, // PENDING: limits, duplicates, at-least-one
};

const SORTS = ['price_asc', 'price_desc'];
const MONEY_MSG = 'Must be a number from 0 with at most 2 decimals';

function parseIngredients(raw, errors) {
  if (isBlank(raw)) return [];
  if (!Array.isArray(raw)) { errors.push({ field: 'ingredients', message: 'Must be a list' }); return []; }
  if (raw.length > RULES.ingredients.maxItems) {
    errors.push({ field: 'ingredients', message: `At most ${RULES.ingredients.maxItems} ingredients` });
    return [];
  }
  const seen = new Set();
  return raw.map((item, i) => {
    const field = `ingredients[${i}]`;
    if (!isPlainObject(item)) { errors.push({ field, message: 'Must be an object with name and quantity' }); return null; }
    const name = toText(item.name, { max: RULES.ingredients.nameMax });
    const quantity = toText(item.quantity, { max: RULES.ingredients.quantityMax });
    if (!name) errors.push({ field: `${field}.name`, message: `Must be text of 1-${RULES.ingredients.nameMax} characters` });
    if (!quantity) errors.push({ field: `${field}.quantity`, message: `Must be text of 1-${RULES.ingredients.quantityMax} characters, e.g. "40 g"` });
    if (name && seen.has(name.toLowerCase())) errors.push({ field: `${field}.name`, message: 'Ingredient is listed twice' });
    if (name) seen.add(name.toLowerCase());
    return { name, quantity };
  });
}

// POST and PUT /products body. Image is uploaded separately (POST /products/:id/image).
function parseProductBody(req) {
  const body = req.body;
  if (!isPlainObject(body)) return { value: null, errors: [{ field: 'body', message: 'JSON object expected' }] };
  const errors = [];
  const value = {};
  const take = (field, parse, message) => {
    const raw = body[field];
    if (isBlank(raw)) {
      if (RULES[field].required) errors.push({ field, message: 'Required' });
      value[field] = null;
      return;
    }
    const parsed = parse(raw);
    if (parsed === null) errors.push({ field, message });
    else value[field] = parsed;
  };

  take('name', (v) => toText(v, { max: RULES.name.max }), `Must be text of 1-${RULES.name.max} characters`);
  take('categoryId', (v) => toInt(v, { min: 1 }), 'Must be a positive whole number');
  take('costPrice', (v) => toAmount(v), MONEY_MSG);
  take('sellingPrice', (v) => toAmount(v), MONEY_MSG);
  take('quantity', (v) => toInt(v), 'Must be a whole number from 0');
  take('lowStockAlert', (v) => toInt(v), 'Must be a whole number from 0');
  take('discountId', (v) => toInt(v, { min: 1 }), 'Must be a positive whole number');
  value.ingredients = parseIngredients(body.ingredients, errors);
  return { value, errors };
}

// GET /products query string.
function parseProductQuery(req) {
  const q = req.query;
  const errors = [];
  const only = (field) => {
    if (q[field] === undefined) return undefined;
    if (typeof q[field] !== 'string') { errors.push({ field, message: 'Must be a single value' }); return undefined; }
    return q[field];
  };

  const search = only('search') === undefined ? null : toText(q.search, { min: 1, max: 100 });
  if (q.search !== undefined && typeof q.search === 'string' && q.search.trim() !== '' && search === null) {
    errors.push({ field: 'search', message: 'Must be at most 100 characters' });
  }
  const status = only('status');
  if (status !== undefined && !Object.hasOwn(STATUS_FILTERS, status)) {
    errors.push({ field: 'status', message: `Must be one of: ${Object.keys(STATUS_FILTERS).join(', ')}` });
  }
  const categoryId = only('categoryId') === undefined ? null : toInt(q.categoryId, { min: 1 });
  if (q.categoryId !== undefined && categoryId === null) errors.push({ field: 'categoryId', message: 'Must be a positive whole number' });
  const sort = only('sort');
  if (sort !== undefined && !SORTS.includes(sort)) errors.push({ field: 'sort', message: `Must be one of: ${SORTS.join(', ')}` });

  const pagination = parsePagination(q);
  errors.push(...pagination.errors);
  return {
    value: { search, status: status ?? null, categoryId, sort: sort ?? null, page: pagination.page, limit: pagination.limit },
    errors,
  };
}

// PATCH /products/:id/ingredients/:ingredientId body
function parseIngredientQuantityBody(req) {
  const quantity = isPlainObject(req.body) ? toText(req.body.quantity, { max: RULES.ingredients.quantityMax }) : null;
  if (!quantity) return { value: null, errors: [{ field: 'quantity', message: `Must be text of 1-${RULES.ingredients.quantityMax} characters, e.g. "40 g"` }] };
  return { value: { quantity }, errors: [] };
}

// POST /categories body. PENDING: max length 100, names unique ignoring case.
function parseCategoryBody(req) {
  const name = isPlainObject(req.body) ? toText(req.body.name, { max: 100 }) : null;
  if (!name) return { value: null, errors: [{ field: 'name', message: 'Must be text of 1-100 characters' }] };
  return { value: { name }, errors: [] };
}

module.exports = {
  RULES,
  validateProductBody: validate(parseProductBody, 'body'),
  validateProductQuery: validate(parseProductQuery, 'query'),
  validateIngredientQuantityBody: validate(parseIngredientQuantityBody, 'body'),
  validateCategoryBody: validate(parseCategoryBody, 'body'),
};
