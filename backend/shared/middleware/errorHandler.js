const { ERROR_CODES } = require('../errors');
const { MESSAGES } = require('../messages');
const { AppError, sendError } = require('../errors');

// Last middleware. Known errors keep their status; anything unexpected becomes a generic 500
// (details are logged, never sent to the client).
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err instanceof AppError) {
    if (err.retryAfterSeconds) res.set('Retry-After', String(err.retryAfterSeconds));
    if (err.status === 401) res.set('WWW-Authenticate', 'Bearer');
    return sendError(res, err.status, err.code, err.message, err.errors);
  }
  if (err.type === 'entity.parse.failed') return sendError(res, 400, ERROR_CODES.VALIDATION_ERROR, MESSAGES.MALFORMED_JSON);
  if (err.type === 'entity.too.large') return sendError(res, 413, ERROR_CODES.VALIDATION_ERROR, MESSAGES.PAYLOAD_TOO_LARGE);
  console.error(err);
  return sendError(res, 500, ERROR_CODES.INTERNAL_ERROR, MESSAGES.INTERNAL);
}

module.exports = errorHandler;
