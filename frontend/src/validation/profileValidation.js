// Required-field checks for the Settings shop / admin profile forms.
// The designs mark only Email and Website as optional on the shop form, so everything else is required.
// A new admin password follows the same rule as signup (the server enforces it too).
import { validateNewPassword } from './authValidation.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUIRED = 'This field is required';
const BAD_EMAIL = 'Enter a valid email address';

export function validateShop(v) {
  const errors = {};
  if (!v.name.trim()) errors.name = REQUIRED;
  if (!v.address.trim()) errors.address = REQUIRED;
  if (!v.phone.trim()) errors.phone = REQUIRED;
  if (!v.timezone) errors.timezone = REQUIRED;
  if (v.email.trim() && !EMAIL.test(v.email.trim())) errors.email = BAD_EMAIL;
  return errors;
}

export function validateAdmin(v, { needPassword }) {
  const errors = {};
  if (!v.firstName.trim()) errors.firstName = REQUIRED;
  if (!v.lastName.trim()) errors.lastName = REQUIRED;
  if (!v.phone.trim()) errors.phone = REQUIRED;
  if (!v.email.trim()) errors.email = REQUIRED;
  else if (!EMAIL.test(v.email.trim())) errors.email = BAD_EMAIL;
  if (needPassword) {
    const problem = validateNewPassword(v.password);
    if (problem) errors.password = problem;
  }
  return errors;
}
