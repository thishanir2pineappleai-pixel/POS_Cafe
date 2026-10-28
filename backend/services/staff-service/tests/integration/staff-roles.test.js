// Integration tests for staff roles, teams and the permission matrix (Roles & Permission tab).
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { store } = require('../../repositories/memory/store');
const { createUser, tokenFor, useTestServer } = require('./helpers');
const { bearer, makeRole, makeTeam, makeShift, seedStaff, setupAccounts } = require('./staffHelpers');

const { ctx, api } = useTestServer();
let acc;

beforeEach(async () => {
  acc = await setupAccounts();
  ctx.token = acc.owner;
});

const as = (token, method, url, opts = {}) => api(method, url, { ...opts, headers: { ...bearer(token), ...opts.headers } });
const fieldsOf = (res) => (res.body.errors || []).map((e) => e.field);
const MODULES = ['Cashier Dashboard', 'Staff Management', 'Menu Management', 'Sales Management', 'Inventory Management', 'Customer Management', 'Settings', 'Admin Dashboard', 'Menu UI'];

test('permission catalogue: the nine modules and four actions of the Figma, for signed-in users only', async () => {
  const res = await as(acc.admin, 'GET', '/api/v1/permissions');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.modules, MODULES);
  assert.deepEqual(res.body.data.actions, ['view', 'add', 'edit', 'delete']);
  ctx.token = null;
  assert.equal((await api('GET', '/api/v1/permissions')).status, 401);
});

test('roles: the owner creates, lists with the whole matrix and a staff count, renames and reads', async () => {
  assert.deepEqual((await as(acc.owner, 'GET', '/api/v1/roles')).body.data, [], 'nothing is seeded');
  const made = await as(acc.owner, 'POST', '/api/v1/roles', { json: { name: '  Cashier  ', shopId: acc.shop2, accountId: 2, grants: { Settings: ['delete'] } } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const role = made.body.data;
  assert.equal(role.name, 'Cashier');
  assert.equal(role.staffCount, 0);
  assert.equal(role.permissions.length, 9);
  assert.deepEqual(role.permissions.map((p) => p.module), MODULES);
  assert.ok(role.permissions.every((p) => !p.view && !p.add && !p.edit && !p.delete), 'a new role holds nothing; the body cannot grant');
  assert.equal(store.staffRoles.get(role.id).shopId, acc.shop1, 'the shop comes from the account, not the body');

  await seedStaff({ shopId: acc.shop1, roleId: role.id, teamId: (await makeTeam(acc.shop1, 'T')).id, shiftId: (await makeShift(acc.shop1, 'S', '06:00', '14:00')).id });
  const list = (await as(acc.owner, 'GET', '/api/v1/roles')).body.data;
  assert.equal(list.length, 1);
  assert.equal(list[0].staffCount, 1);
  assert.equal((await as(acc.admin, 'GET', `/api/v1/roles/${role.id}`)).status, 200, 'admins may read');
  const renamed = await as(acc.owner, 'PUT', `/api/v1/roles/${role.id}`, { json: { name: 'Head Cashier' } });
  assert.equal(renamed.body.data.name, 'Head Cashier');
  assert.equal((await as(acc.owner, 'GET', '/api/v1/roles/99999')).status, 404);
  assert.equal((await as(acc.owner, 'GET', '/api/v1/roles/abc')).status, 400);
});

test('roles: validation and duplicate names (ignoring case) within a shop', async () => {
  assert.equal((await as(acc.owner, 'POST', '/api/v1/roles', { json: {} })).status, 400);
  assert.equal((await as(acc.owner, 'POST', '/api/v1/roles', { json: { name: 'x'.repeat(51) } })).status, 400);
  assert.equal((await as(acc.owner, 'POST', '/api/v1/roles', { json: { name: 'Manager' } })).status, 201);
  const dup = await as(acc.owner, 'POST', '/api/v1/roles', { json: { name: 'MANAGER' } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.code, 'DUPLICATE');
  const other = await as(acc.owner, 'POST', `/api/v1/roles?shopId=${acc.shop2}`, { json: { name: 'Manager' } });
  assert.equal(other.status, 201, 'the same name in another shop is fine');
  assert.equal((await as(acc.owner, 'POST', `/api/v1/roles?shopId=${acc.shop3}`, { json: { name: 'X' } })).status, 404, "another account's shop");
  assert.equal((await as(acc.owner, 'GET', '/api/v1/roles?shopId=abc')).status, 400);
});

test('permission matrix: only the owner saves it, it replaces the whole matrix and is validated', async () => {
  const role = await makeRole(acc.shop1, 'Manager');
  const url = `/api/v1/roles/${role.id}/permissions`;
  const matrix = { permissions: [{ module: 'Staff Management', view: true, add: true, edit: true, delete: false }, { module: 'Menu Management', view: true }] };
  assert.equal((await as(acc.admin, 'PUT', url, { json: matrix })).status, 403, 'an admin can never widen a role');
  assert.equal((await as(acc.other, 'PUT', url, { json: matrix })).status, 404);
  const saved = await as(acc.owner, 'PUT', url, { json: matrix });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const byModule = Object.fromEntries(saved.body.data.permissions.map((p) => [p.module, p]));
  assert.deepEqual(byModule['Staff Management'], { module: 'Staff Management', view: true, add: true, edit: true, delete: false });
  assert.deepEqual(byModule['Menu Management'], { module: 'Menu Management', view: true, add: false, edit: false, delete: false });
  assert.equal(byModule.Settings.view, false);

  const replaced = await as(acc.owner, 'PUT', url, { json: { permissions: [{ module: 'Settings', view: true }] } });
  assert.equal(replaced.body.data.permissions.find((p) => p.module === 'Staff Management').view, false, 'modules not listed end with nothing');
  const cleared = await as(acc.owner, 'PUT', url, { json: { permissions: [] } });
  assert.ok(cleared.body.data.permissions.every((p) => !p.view));

  for (const bad of [{}, { permissions: 'all' }, { permissions: [{ module: 'Nuclear Codes', view: true }] },
    { permissions: [{ module: 'Settings', view: 'yes' }] }, { permissions: [{ module: 'Settings' }, { module: 'Settings' }] }, { permissions: new Array(10).fill({ module: 'Settings' }) }]) {
    assert.equal((await as(acc.owner, 'PUT', url, { json: bad })).status, 400, JSON.stringify(bad));
  }
});

test('deleting a role or team: only the owner, and never while staff still use it', async () => {
  const role = await makeRole(acc.shop1, 'Manager');
  const team = await makeTeam(acc.shop1, 'Service');
  const shift = await makeShift(acc.shop1, 'Morning', '06:00', '14:00');
  const s = await seedStaff({ shopId: acc.shop1, roleId: role.id, teamId: team.id, shiftId: shift.id });
  assert.equal((await as(acc.admin, 'DELETE', `/api/v1/roles/${role.id}`)).status, 403);
  assert.equal((await as(acc.owner, 'DELETE', `/api/v1/roles/${role.id}`)).status, 409);
  assert.equal((await as(acc.owner, 'DELETE', `/api/v1/teams/${team.id}`)).status, 409);
  await as(acc.owner, 'DELETE', `/api/v1/staff/${s.id}`); // removed staff can be restored, so they still count
  assert.equal((await as(acc.owner, 'DELETE', `/api/v1/roles/${role.id}`)).status, 409);
  const unused = await makeRole(acc.shop1, 'Unused');
  assert.equal((await as(acc.owner, 'DELETE', `/api/v1/roles/${unused.id}`)).status, 200);
  assert.equal((await as(acc.owner, 'GET', `/api/v1/roles/${unused.id}`)).status, 404);
  assert.equal((await as(acc.other, 'DELETE', `/api/v1/roles/${role.id}`)).status, 404);
});

test('teams: create, list, rename, delete with the same rules', async () => {
  const made = await as(acc.owner, 'POST', '/api/v1/teams', { json: { name: 'Cleaning' } });
  assert.equal(made.status, 201);
  assert.equal(made.body.data.staffCount, 0);
  assert.equal('permissions' in made.body.data, false, 'teams have no permissions');
  assert.equal((await as(acc.owner, 'POST', '/api/v1/teams', { json: { name: 'cleaning' } })).status, 409);
  assert.equal((await as(acc.admin, 'POST', '/api/v1/teams', { json: { name: 'Cooking' } })).status, 403);
  assert.equal((await as(acc.owner, 'PUT', `/api/v1/teams/${made.body.data.id}`, { json: { name: 'Housekeeping' } })).body.data.name, 'Housekeeping');
  assert.equal((await as(acc.admin, 'GET', '/api/v1/teams')).body.data.length, 1);
  assert.equal((await as(acc.other, 'GET', `/api/v1/teams/${made.body.data.id}`)).status, 404);
  assert.equal((await as(acc.owner, 'DELETE', `/api/v1/teams/${made.body.data.id}`)).status, 200);
});

test('an account without a shop reads empty lists and cannot create roles', async () => {
  await createUser({ id: 9300, accountId: 3, role: 'owner', email: 'noshop@x.com' });
  const token = (await tokenFor(9300)).token;
  assert.deepEqual((await as(token, 'GET', '/api/v1/roles')).body.data, []);
  assert.deepEqual((await as(token, 'GET', '/api/v1/teams')).body.data, []);
  assert.equal((await as(token, 'POST', '/api/v1/roles', { json: { name: 'X' } })).status, 409);
});
