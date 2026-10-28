const { isPlainObject, toAmount, toText } = require('@pos-cafe/shared/validator');
const { validate } = require('@pos-cafe/shared/validate');

// POST /discounts body: a Menu discount definition (name and percentage only). Discount APPLICATIONS (a definition applied
// over a period to products) belong to Sales Management.
// PENDING: percentage range 0-100 with at most 2 decimals, max name length 100, names unique ignoring case.
function parseDiscountBody(req) {
  const body = req.body;
  if (!isPlainObject(body)) return { value: null, errors: [{ field: 'body', message: 'JSON object expected' }] };
  const errors = [];
  const name = toText(body.name, { max: 100 });
  if (!name) errors.push({ field: 'name', message: 'Must be text of 1-100 characters' });
  const percentage = toAmount(body.percentage, { max: 100 });
  if (percentage === null) errors.push({ field: 'percentage', message: 'Must be a number from 0 to 100 with at most 2 decimals' });
  return { value: { name, percentage }, errors };
}

module.exports = { validateDiscountBody: validate(parseDiscountBody, 'body') };
