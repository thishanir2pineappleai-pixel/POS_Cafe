// Validation for staff roles, teams and the permission matrix (Roles & Permission tab).
const { PERMISSION_ACTIONS, PERMISSION_MODULES } = require('../../config/constants/roles');
const { isPlainObject, toInt } = require('@pos-cafe/shared/validator');
const { notAnObject, reader } = require('@pos-cafe/shared/reader');
const { validate } = require('@pos-cafe/shared/validate');

// POST/PUT roles and teams: the "Role Name" / "Team Name" field of the dialogs.
function parseName(req) {
  if (!isPlainObject(req.body)) return notAnObject();
  const errors = [];
  return { value: { name: reader(req.body, errors).text('name', { max: 50 }) }, errors };
}

// PUT /roles/:id/permissions body: { permissions: [{ module, view, add, edit, delete }] }, the whole matrix at once
// (the "Update" button saves every row). A module that is not listed ends with no permissions.
function parsePermissions(req) {
  if (!isPlainObject(req.body)) return notAnObject();
  const errors = [];
  const list = req.body.permissions;
  if (!Array.isArray(list) || list.length > PERMISSION_MODULES.length) {
    return { value: null, errors: [{ field: 'permissions', message: `Must be a list of at most ${PERMISSION_MODULES.length} modules` }] };
  }
  const grants = {};
  list.forEach((row, i) => {
    const at = `permissions[${i}]`;
    if (!isPlainObject(row) || !PERMISSION_MODULES.includes(row.module)) { errors.push({ field: `${at}.module`, message: `Must be one of: ${PERMISSION_MODULES.join(', ')}` }); return; }
    if (grants[row.module]) { errors.push({ field: `${at}.module`, message: 'Listed twice' }); return; }
    const actions = [];
    for (const action of PERMISSION_ACTIONS) {
      if (row[action] === undefined) continue;
      if (typeof row[action] !== 'boolean') errors.push({ field: `${at}.${action}`, message: 'Must be true or false' });
      else if (row[action]) actions.push(action);
    }
    grants[row.module] = actions;
  });
  return { value: { grants }, errors };
}

function parseShopQuery(req) {
  const errors = [];
  const raw = req.query.shopId;
  const shopId = raw === undefined || raw === '' ? undefined : toInt(raw, { min: 1 });
  if (shopId === null) errors.push({ field: 'shopId', message: 'Must be a positive whole number' });
  return { value: { shopId: shopId ?? undefined }, errors };
}

module.exports = {
  validateName: validate(parseName),
  validatePermissions: validate(parsePermissions),
  validateShopQuery: validate(parseShopQuery, 'query'),
  parseShopQuery,
};
