const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { requireRole } = require('@pos-cafe/shared/authorize');
const { MESSAGES } = require('../../config/constants/messages');
const { holds } = require('../../config/constants/roles');

// requirePermission('Staff Management', 'edit'): the caller's ACCOUNT role must hold that permission
// (see config/constants/roles.js: the Owner holds all, an Admin holds view/add/edit but not delete).
const requirePermission = (module, action) => (req, res, next) => (
  req.auth && holds(req.auth.role, module, action) ? next() : next(new AppError(403, ERROR_CODES.FORBIDDEN, MESSAGES.FORBIDDEN))
);

module.exports = { requireRole, requirePermission };
