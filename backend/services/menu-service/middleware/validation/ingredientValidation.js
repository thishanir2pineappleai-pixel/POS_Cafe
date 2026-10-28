const { isPlainObject, toText } = require('@pos-cafe/shared/validator');
const { validate } = require('@pos-cafe/shared/validate');

// POST /ingredients body. PENDING: max length 100, names unique ignoring case.
function parseIngredientBody(req) {
  const name = isPlainObject(req.body) ? toText(req.body.name, { max: 100 }) : null;
  if (!name) return { value: null, errors: [{ field: 'name', message: 'Must be text of 1-100 characters' }] };
  return { value: { name }, errors: [] };
}

// GET /ingredients?search= (autocomplete). Empty or missing search lists everything.
function parseIngredientQuery(req) {
  const raw = req.query.search;
  if (raw === undefined || raw === '') return { value: { search: null }, errors: [] };
  const search = toText(raw, { max: 100 });
  if (!search) return { value: null, errors: [{ field: 'search', message: 'Must be at most 100 characters' }] };
  return { value: { search }, errors: [] };
}

module.exports = {
  validateIngredientBody: validate(parseIngredientBody, 'body'),
  validateIngredientQuery: validate(parseIngredientQuery, 'query'),
};
