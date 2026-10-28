// Roles, teams and permissions endpoints (Roles & Permission tab).
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { MESSAGES } = require('../../config/constants/messages');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const roleService = require('../../services/user/roleService');

const shopOf = (req) => req.valid.query?.shopId;

const permissions = asyncHandler(async (req, res) => sendSuccess(res, { data: roleService.catalogue() }));

const crud = (listFn, getFn, createFn, updateFn, deleteFn, savedMessage, deletedMessage) => ({
  list: asyncHandler(async (req, res) => sendSuccess(res, { data: await listFn(req.auth, shopOf(req)) })),
  get: asyncHandler(async (req, res) => sendSuccess(res, { data: await getFn(req.auth, req.valid.id) })),
  create: asyncHandler(async (req, res) => sendSuccess(res, { status: 201, message: savedMessage, data: await createFn(req.auth, shopOf(req), req.valid.body) })),
  update: asyncHandler(async (req, res) => sendSuccess(res, { message: savedMessage, data: await updateFn(req.auth, req.valid.id, req.valid.body) })),
  remove: asyncHandler(async (req, res) => { await deleteFn(req.auth, req.valid.id); sendSuccess(res, { message: deletedMessage }); }),
});

const roles = crud(roleService.listRoles, roleService.getRole, roleService.createRole, roleService.updateRole, roleService.deleteRole, MESSAGES.ROLE_SAVED, MESSAGES.ROLE_DELETED);
const teams = crud(roleService.listTeams, roleService.getTeam, roleService.createTeam, roleService.updateTeam, roleService.deleteTeam, MESSAGES.TEAM_SAVED, MESSAGES.TEAM_DELETED);
const setPermissions = asyncHandler(async (req, res) => sendSuccess(res, { message: MESSAGES.PERMISSIONS_SAVED, data: await roleService.setPermissions(req.auth, req.valid.id, req.valid.body) }));

module.exports = { permissions, roles, teams, setPermissions };
