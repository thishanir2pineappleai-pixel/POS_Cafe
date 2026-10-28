// Request validation helpers shared by every service.
const { ERROR_CODES, AppError } = require('./errors');
const { MESSAGES } = require('./messages');
const { toInt, isBlank, isPlainObject, passwordProblem, toText } = require('./validator');

const fail = (errors) => new AppError(400, ERROR_CODES.VALIDATION_ERROR, MESSAGES.VALIDATION_FAILED, errors);

// validate(parse, source): parse(req) returns { value, errors }. On success the cleaned value is stored
// in req.valid[source] ('body' or 'query'); on failure the request ends with a 400.
const validate = (parse, source = 'body') => (req, res, next) => {
  const { value, errors } = parse(req);
  if (errors.length > 0) return next(fail(errors));
  req.valid = { ...req.valid, [source]: value };
  return next();
};

// Checks a :param such as :id is a positive whole number and stores it in req.valid[name].
const idParam = (name = 'id') => (req, res, next) => {
  const id = toInt(req.params[name], { min: 1 });
  if (id === null) return next(fail([{ field: name, message: 'Must be a positive whole number' }]));
  req.valid = { ...req.valid, [name]: id };
  return next();
};

// ---- Field readers for body parsers. Each pushes into `errors` and returns the cleaned value (or null). ----
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// rule: { required, max }
function textField(body, field, rule, errors) {
  const raw = body[field];
  if (isBlank(raw)) {
    if (rule.required) errors.push({ field, message: 'Required' });
    return null;
  }
  const value = toText(raw, { max: rule.max });
  if (value === null) errors.push({ field, message: `Must be text of 1-${rule.max} characters` });
  return value;
}

function emailField(body, rule, errors) {
  const email = textField(body, 'email', rule, errors);
  if (email && !EMAIL.test(email)) {
    errors.push({ field: 'email', message: 'Must be a valid email address' });
    return null;
  }
  return email;
}

// Passwords are never trimmed or altered, and never appear in an error message.
function passwordField(body, errors) {
  const problem = passwordProblem(body.password);
  if (problem) { errors.push({ field: 'password', message: problem }); return null; }
  return body.password;
}

const notAnObject = () => ({ value: null, errors: [{ field: 'body', message: 'JSON object expected' }] });

module.exports = {
  validate, idParam, fail, textField, emailField, passwordField, notAnObject, isPlainObject,
};
