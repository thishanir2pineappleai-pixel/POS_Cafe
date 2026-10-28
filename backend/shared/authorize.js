// Use after authenticate: requireRole('owner') lets only users with that server-assigned role through (403 otherwise).
const { ERROR_CODES, AppError } = require('./errors');
const { MESSAGES } = require('./messages');

const forbidden = () => new AppError(403, ERROR_CODES.FORBIDDEN, MESSAGES.FORBIDDEN);

const requireRole = (...roles) => (req, res, next) => (
  req.auth && roles.includes(req.auth.role) ? next() : next(forbidden())
);

module.exports = { requireRole };
