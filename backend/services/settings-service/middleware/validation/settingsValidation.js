const { TIMEZONES } = require('../../config/constants/timezones');
const {
  validate, textField, emailField, notAnObject, isPlainObject,
} = require('@pos-cafe/shared/validate');
const { isBlank } = require('@pos-cafe/shared/validator');

// Only "Email (Optional)" and "Website (Optional)" on the shop form are CONFIRMED optional by the Figma.
// Everything else below is PENDING APPROVAL: the Figma marks no other field as required or optional, and states
// no lengths, phone format or website format. Change them here, in one place.
const SHOP_RULES = {
  name: { required: true, max: 150 },
  address: { required: true, max: 255 },
  phone: { required: true, max: 30 }, // no phone pattern is enforced
  email: { required: false, max: 254 }, // CONFIRMED optional
  website: { required: false, max: 255 }, // CONFIRMED optional; the Figma shows "www.poscafe.com", so no URL scheme is required
};

// POST and PUT /settings/shops body (the logo is uploaded separately).
function parseShopBody(req) {
  const body = req.body;
  if (!isPlainObject(body)) return notAnObject();
  const errors = [];
  const value = {
    name: textField(body, 'name', SHOP_RULES.name, errors),
    address: textField(body, 'address', SHOP_RULES.address, errors),
    phone: textField(body, 'phone', SHOP_RULES.phone, errors),
    email: emailField(body, SHOP_RULES.email, errors),
    website: textField(body, 'website', SHOP_RULES.website, errors),
    timezone: null,
  };
  if (isBlank(body.timezone)) errors.push({ field: 'timezone', message: 'Required' });
  else if (!TIMEZONES.includes(body.timezone)) errors.push({ field: 'timezone', message: 'Must be one of the options from GET /settings/timezones' });
  else value.timezone = body.timezone;
  return { value, errors };
}

// PUT /internal/accounts/:accountId/first-shop body (sent by the Auth Service at signup activation). Signup collects no
// shop e-mail, website or timezone, so those start empty (PENDING approval; the shop form asks for a timezone on its next edit).
function parseFirstShopBody(req) {
  const body = req.body;
  if (!isPlainObject(body)) return notAnObject();
  const errors = [];
  const value = {
    ownerId: Number.isInteger(body.ownerId) && body.ownerId > 0 ? body.ownerId : null,
    name: textField(body, 'name', SHOP_RULES.name, errors),
    address: textField(body, 'address', SHOP_RULES.address, errors),
    phone: textField(body, 'phone', SHOP_RULES.phone, errors),
    email: null,
    website: null,
    timezone: null,
  };
  if (value.ownerId === null) errors.push({ field: 'ownerId', message: 'Must be a positive whole number' });
  return { value, errors };
}

module.exports = {
  SHOP_RULES,
  validateShopBody: validate(parseShopBody, 'body'),
  validateFirstShopBody: validate(parseFirstShopBody, 'body'),
};
