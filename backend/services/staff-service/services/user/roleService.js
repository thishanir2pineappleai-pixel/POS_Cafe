// Staff roles, teams and the permission matrix (Roles & Permission tab).
//   * Everything belongs to one shop of the caller's account; another account's role or team answers 404.
//   * Reading is for anyone who may view Staff Management; changing roles, teams and permissions is the OWNER's only
//     (enforced on the routes).
//   * Privilege rule (also used when a role is given to a staff member): a role can only be assigned by someone who holds
//     every permission in it, so nobody can hand out more than they have.
// Nothing is seeded: the owner creates the roles and teams (the Figma lists Cashier, Manager, ... only as examples).
const { staffRepository, staffRoleRepository } = require('../../repositories');
const { DuplicateError } = require('../../repositories/memory/scoped');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('../../config/constants/messages');
const { PERMISSION_ACTIONS, PERMISSION_MODULES, holds } = require('../../config/constants/roles');
const { requireShop, resolveShop } = require('./shopScope');

const { roles, teams } = staffRoleRepository;
const taken = () => new AppError(409, ERROR_CODES.DUPLICATE, MESSAGES.NAME_TAKEN, [{ field: 'name', message: 'Already used' }]);
const inUse = () => new AppError(409, ERROR_CODES.CONFLICT, MESSAGES.IN_USE);

// Every module with all four flags, so the frontend can draw the whole matrix.
const matrix = (grants = {}) => PERMISSION_MODULES.map((module) => ({
  module, ...Object.fromEntries(PERMISSION_ACTIONS.map((a) => [a, (grants[module] || []).includes(a)])),
}));

const roleDto = (row, staffCount) => ({ id: row.id, name: row.name, staffCount, permissions: matrix(row.grants), createdAt: row.createdAt, updatedAt: row.updatedAt });
const teamDto = (row, staffCount) => ({ id: row.id, name: row.name, staffCount, createdAt: row.createdAt, updatedAt: row.updatedAt });

async function counts(shopId, field) {
  const map = new Map();
  for (const s of await staffRepository.list(shopId)) map.set(s[field], (map.get(s[field]) || 0) + 1);
  return map;
}

function mapDuplicate(err) {
  if (err instanceof DuplicateError) throw taken();
  throw err;
}

// ---- generic over roles / teams ----
function named(repo, { notFound, dto, field }) {
  const find = async (auth, id) => {
    const row = await repo.find(auth.accountId, id);
    if (!row) throw new AppError(404, ERROR_CODES.NOT_FOUND, notFound);
    return row;
  };
  return {
    async list(auth, shopId) {
      const shop = await resolveShop(auth, shopId);
      if (shop === null) return [];
      const used = await counts(shop, field);
      return (await repo.list(shop)).map((r) => dto(r, used.get(r.id) || 0));
    },
    async get(auth, id) {
      const row = await find(auth, id);
      return dto(row, (await counts(row.shopId, field)).get(row.id) || 0);
    },
    async create(auth, shopId, { name }) {
      const shop = await requireShop(auth, shopId);
      const extra = repo === roles ? { grants: {} } : {};
      return dto(await repo.create({ accountId: auth.accountId, shopId: shop, name, ...extra }).catch(mapDuplicate), 0);
    },
    async update(auth, id, { name }) {
      const row = await find(auth, id);
      const saved = await repo.update(row.id, { name }).catch(mapDuplicate);
      return dto(saved, (await counts(row.shopId, field)).get(row.id) || 0);
    },
    // A role or team that any staff member (even a removed one, who can be restored) still uses cannot be deleted.
    async remove(auth, id) {
      const row = await find(auth, id);
      if (await staffRepository.countUsing(row.shopId, field, row.id) > 0) throw inUse();
      await repo.remove(row.id);
    },
    find,
  };
}

const roleApi = named(roles, { notFound: MESSAGES.ROLE_NOT_FOUND, dto: roleDto, field: 'roleId' });
const teamApi = named(teams, { notFound: MESSAGES.TEAM_NOT_FOUND, dto: teamDto, field: 'teamId' });

// Replaces the whole matrix of a role. An Owner can grant anything; the route already limits this to owners.
async function setPermissions(auth, id, { grants }) {
  const row = await roleApi.find(auth, id);
  const saved = await roles.update(row.id, { grants });
  return roleDto(saved, (await counts(row.shopId, 'roleId')).get(row.id) || 0);
}

// Throws 403 unless the caller holds every permission the role contains.
function assertCanAssign(auth, role) {
  for (const [module, actions] of Object.entries(role.grants || {})) {
    for (const action of actions) if (!holds(auth.role, module, action)) throw new AppError(403, ERROR_CODES.FORBIDDEN, MESSAGES.CANNOT_GRANT);
  }
}

const catalogue = () => ({ modules: PERMISSION_MODULES, actions: PERMISSION_ACTIONS });

module.exports = {
  listRoles: roleApi.list, getRole: roleApi.get, createRole: roleApi.create, updateRole: roleApi.update, deleteRole: roleApi.remove, findRole: roleApi.find,
  listTeams: teamApi.list, getTeam: teamApi.get, createTeam: teamApi.create, updateTeam: teamApi.update, deleteTeam: teamApi.remove, findTeam: teamApi.find,
  setPermissions, assertCanAssign, catalogue,
};
