// Staff Management authorization model.
//
// Two different things exist and must not be confused:
//   * ACCOUNT ROLES ('owner', 'admin') belong to the people who can sign in (Settings > Admin profiles). They decide what the
//     caller may do with the Staff Management API. The server enforces them (middleware/auth/authorize.js).
//   * STAFF ROLES (Cashier, Manager, ...) are labels with a permission matrix, created by the owner on the Roles & Permission
//     tab. Staff members cannot sign in yet, so a staff role is stored and can be assigned, but nothing reads it at login.
//
// PENDING APPROVAL: the Figma shows 9 of "25 permissions"; the other 16 are not visible, so only these 9 modules exist.
const PERMISSION_MODULES = Object.freeze([
  'Cashier Dashboard', 'Staff Management', 'Menu Management', 'Sales Management', 'Inventory Management',
  'Customer Management', 'Settings', 'Admin Dashboard', 'Menu UI',
]);
const PERMISSION_ACTIONS = Object.freeze(['view', 'add', 'edit', 'delete']); // the Figma's VIEW / ADD / EDIT / DELETE columns

// PENDING APPROVAL (security default, not from the Figma): an Admin may view, add and edit but never delete, and the Owner
// may do everything. The same table limits which staff roles an Admin may hand out: a role can only be assigned by someone who
// holds every permission in it, so nobody can give out more than they have.
const ADMIN_GRANTS = Object.freeze(Object.fromEntries(PERMISSION_MODULES.map((m) => [m, ['view', 'add', 'edit']])));

// Does an account role hold `action` on `module`?
function holds(accountRole, module, action) {
  if (accountRole === 'owner') return true;
  if (accountRole === 'admin') return (ADMIN_GRANTS[module] || []).includes(action);
  return false;
}

module.exports = { PERMISSION_MODULES, PERMISSION_ACTIONS, ADMIN_GRANTS, holds };
