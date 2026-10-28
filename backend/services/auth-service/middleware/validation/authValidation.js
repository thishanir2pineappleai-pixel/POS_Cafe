const { isEmail, isPlainObject, passwordProblem, toPhone, toText } = require('@pos-cafe/shared/validator');
const { policy } = require('../../config');
const { validate } = require('@pos-cafe/shared/validate');

// None of these ever put a submitted value (password, code, key, token) into an error message.
const body = (req) => (isPlainObject(req.body) ? req.body : null);
const notAnObject = () => ({ value: null, errors: [{ field: 'body', message: 'JSON object expected' }] });

const emailField = (b, errors, field = 'email') => {
  if (!isEmail(typeof b[field] === 'string' ? b[field].trim() : b[field])) { errors.push({ field, message: 'Must be a valid email address' }); return null; }
  return b[field].trim();
};
const textField = (b, field, max, errors) => {
  const value = toText(b[field], { max });
  if (value === null) errors.push({ field, message: `Must be text of 1-${max} characters` });
  return value;
};
const tokenField = (b, field, errors) => {
  const ok = typeof b[field] === 'string' && b[field].length >= 20 && b[field].length <= 200;
  if (!ok) errors.push({ field, message: 'Required' });
  return ok ? b[field] : null;
};
const codeField = (b, errors) => {
  const ok = typeof b.code === 'string' && new RegExp(`^\\d{${policy.otp.length}}$`).test(b.code);
  if (!ok) errors.push({ field: 'code', message: `Must be the ${policy.otp.length}-digit code` });
  return ok ? b.code : null;
};
const passwordField = (b, errors, field = 'password') => {
  const problem = passwordProblem(b[field]);
  if (problem) { errors.push({ field, message: problem }); return null; }
  return b[field];
};
const make = (fn) => (req) => {
  const b = body(req);
  if (!b) return notAnObject();
  const errors = [];
  return { value: fn(b, errors), errors };
};

// POST /auth/login. The password is only checked for presence: an old password must still work, so the strength rule
// is applied when a password is CREATED, not when it is used.
const parseLogin = make((b, errors) => {
  const email = emailField(b, errors);
  const password = typeof b.password === 'string' && b.password !== '' && b.password.length <= 128 ? b.password : null;
  if (password === null) errors.push({ field: 'password', message: 'Required' });
  if (b.keepSignedIn !== undefined && typeof b.keepSignedIn !== 'boolean') errors.push({ field: 'keepSignedIn', message: 'Must be true or false' });
  return { email, password, keepSignedIn: b.keepSignedIn === true };
});

// ---- Signup ----
const parseCredentials = make((b, errors) => {
  const value = {
    email: emailField(b, errors),
    username: textField(b, 'username', 50, errors),
    password: passwordField(b, errors),
  };
  if (b.acceptTerms !== true) errors.push({ field: 'acceptTerms', message: 'The terms of service and privacy policy must be accepted' });
  return value;
});
const parseRegistrationToken = make((b, errors) => ({ registrationToken: tokenField(b, 'registrationToken', errors) }));
const parseRegistrationCode = make((b, errors) => ({ registrationToken: tokenField(b, 'registrationToken', errors), code: codeField(b, errors) }));
const parseOwner = make((b, errors) => {
  const phone = toPhone(b.phone);
  if (phone === null) errors.push({ field: 'phone', message: 'Must be a valid phone number (9-15 digits)' });
  return { registrationToken: tokenField(b, 'registrationToken', errors), ownerName: textField(b, 'ownerName', 100, errors), phone };
});
const parseBusiness = make((b, errors) => ({
  registrationToken: tokenField(b, 'registrationToken', errors),
  businessName: textField(b, 'businessName', 150, errors),
  address: textField(b, 'address', 255, errors),
}));
const parseActivate = make((b, errors) => {
  const email = emailField(b, errors);
  const ok = typeof b.accessKey === 'string' && b.accessKey.trim().length >= 8 && b.accessKey.length <= 64;
  if (!ok) errors.push({ field: 'accessKey', message: 'Required' });
  return { email, accessKey: ok ? b.accessKey : null };
});
const parseEmailOnly = make((b, errors) => ({ email: emailField(b, errors) }));

// ---- Forgot / reset password ----
const parseForgotVerify = make((b, errors) => ({ email: emailField(b, errors), code: codeField(b, errors) }));
const parseReset = make((b, errors) => {
  const password = passwordField(b, errors);
  if (typeof b.confirmPassword !== 'string' || b.confirmPassword !== b.password) errors.push({ field: 'confirmPassword', message: 'Passwords do not match' });
  return { resetToken: tokenField(b, 'resetToken', errors), password };
});

module.exports = {
  validateLogin: validate(parseLogin),
  validateCredentials: validate(parseCredentials),
  validateRegistrationToken: validate(parseRegistrationToken),
  validateRegistrationCode: validate(parseRegistrationCode),
  validateOwner: validate(parseOwner),
  validateBusiness: validate(parseBusiness),
  validateActivate: validate(parseActivate),
  validateEmailOnly: validate(parseEmailOnly),
  validateForgotVerify: validate(parseForgotVerify),
  validateReset: validate(parseReset),
};
