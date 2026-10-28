const {
  validate, textField, emailField, passwordField, notAnObject, isPlainObject,
} = require('@pos-cafe/shared/validate');

// Nothing in the Figma marks the admin fields optional, and it states no lengths. PENDING APPROVAL: change them here.
const ADMIN_RULES = {
  firstName: { required: true, max: 100 },
  lastName: { required: true, max: 100 },
  phone: { required: true, max: 30 },
  email: { required: true, max: 254 },
};
// Passwords use the same rule as signup and password reset (@pos-cafe/shared/validator: 8 characters with uppercase,
// lowercase, numbers and symbols, no spaces, at most 128), because they are real login credentials.

function adminFields(body, errors) {
  return {
    firstName: textField(body, 'firstName', ADMIN_RULES.firstName, errors),
    lastName: textField(body, 'lastName', ADMIN_RULES.lastName, errors),
    phone: textField(body, 'phone', ADMIN_RULES.phone, errors),
    email: emailField(body, ADMIN_RULES.email, errors),
  };
}

// POST /settings/admins body. The Add Admin form has a password field.
function parseAdminCreateBody(req) {
  const body = req.body;
  if (!isPlainObject(body)) return notAnObject();
  const errors = [];
  const value = { ...adminFields(body, errors), password: passwordField(body, errors) };
  return { value, errors };
}

// PUT /settings/admins/:id body. The Edit Admin form has no password field, so a password here is refused rather than
// silently ignored (otherwise the caller would think it had been changed).
function parseAdminUpdateBody(req) {
  const body = req.body;
  if (!isPlainObject(body)) return notAnObject();
  const errors = [];
  const value = adminFields(body, errors);
  if (body.password !== undefined) errors.push({ field: 'password', message: 'Not accepted here; use PUT /settings/admins/:id/password' });
  return { value, errors };
}

// PUT /settings/admins/:id/password body. The Figma has only "Enter new password": no current-password or
// confirmation field, so none is required.
function parsePasswordBody(req) {
  const body = req.body;
  if (!isPlainObject(body)) return notAnObject();
  const errors = [];
  const password = passwordField(body, errors);
  return { value: { password }, errors };
}

module.exports = {
  ADMIN_RULES,
  validateAdminCreateBody: validate(parseAdminCreateBody, 'body'),
  validateAdminUpdateBody: validate(parseAdminUpdateBody, 'body'),
  validatePasswordBody: validate(parsePasswordBody, 'body'),
};
