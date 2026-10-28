// Field readers shared by the Staff Management validators. reader(source, errors, prefix) returns functions that read ONE
// field from `source`, push { field, message } into `errors` when it is wrong, and return the cleaned value.
// A missing (blank) field returns undefined; it is an error only when { required: true }. Only the fields a validator asks
// for are ever read, so anything else in the request (shopId, accountId, role, code, ...) is silently ignored.
const { isBlank, isPlainObject, toAmount, toInt, toText } = require('./validator');
const { parseDateOnly, parseMonth, parseTime } = require('./date');

function reader(source, errors, prefix = '') {
  const fail = (field, message) => { errors.push({ field: prefix + field, message }); return undefined; };
  const read = (field, required, parse, message) => {
    const raw = source[field];
    if (isBlank(raw)) return required ? fail(field, 'Required') : undefined;
    const value = parse(raw);
    return value === null || value === undefined ? fail(field, message) : value;
  };
  return {
    fail,
    has: (field) => source[field] !== undefined,
    text: (field, { required = true, max = 255 } = {}) => read(field, required, (v) => toText(v, { max }), `Must be text of 1-${max} characters`),
    oneOf: (field, list, { required = true } = {}) => read(field, required, (v) => (typeof v === 'string' && list.includes(v) ? v : null), `Must be one of: ${list.join(', ')}`),
    int: (field, { required = true, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => read(field, required, (v) => toInt(v, { min, max }), `Must be a whole number from ${min} to ${max}`),
    amount: (field, { required = true, positive = false } = {}) => read(field, required, (v) => {
      const n = toAmount(v);
      return n === null || (positive && n <= 0) ? null : n;
    }, positive ? 'Must be an amount greater than 0 with at most 2 decimals' : 'Must be an amount with at most 2 decimals'),
    // Real booleans only: the string "false" is not accepted.
    bool: (field, { required = true } = {}) => {
      if (source[field] === undefined || source[field] === null) return required ? fail(field, 'Required') : undefined;
      return typeof source[field] === 'boolean' ? source[field] : fail(field, 'Must be true or false');
    },
    date: (field, { required = true } = {}) => read(field, required, parseDateOnly, 'Must be a real date as YYYY-MM-DD'),
    time: (field, { required = true } = {}) => read(field, required, parseTime, 'Must be a time as HH:mm (24 hour)'),
    month: (field, { required = true } = {}) => read(field, required, parseMonth, 'Must be a month as YYYY-MM'),
    object: (field, { required = true } = {}) => {
      if (source[field] === undefined || source[field] === null) return required ? fail(field, 'Required') : undefined;
      return isPlainObject(source[field]) ? source[field] : fail(field, 'Must be an object');
    },
  };
}

const notAnObject = () => ({ value: null, errors: [{ field: 'body', message: 'JSON object expected' }] });

// Query-string text that must be one of a list. Repeated parameters (?a=1&a=2) arrive as arrays and are rejected.
function queryOneOf(query, field, list, errors) {
  if (query[field] === undefined || query[field] === '') return undefined;
  if (typeof query[field] !== 'string' || !list.includes(query[field])) { errors.push({ field, message: `Must be one of: ${list.join(', ')}` }); return undefined; }
  return query[field];
}

function queryText(query, field, errors, max = 100) {
  if (query[field] === undefined || query[field] === '') return undefined;
  const text = typeof query[field] === 'string' ? toText(query[field], { max }) : null;
  if (text === null) { errors.push({ field, message: `Must be text of 1-${max} characters` }); return undefined; }
  return text;
}

module.exports = { reader, notAnObject, queryOneOf, queryText };
