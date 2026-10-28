// Error responses always look like { success: false, code, message, errors? }.
class AppError extends Error {
  constructor(status, code, message, errors) {
    super(message);
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

function sendError(res, status, code, message, errors) {
  const body = { success: false, code, message };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
}

// Machine-readable error codes returned in the JSON error body.
const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE: 'DUPLICATE',
  CONFLICT: 'CONFLICT',
  IMAGE_TOO_LARGE: 'IMAGE_TOO_LARGE',
  UNSUPPORTED_IMAGE: 'UNSUPPORTED_IMAGE',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INVALID_CODE: 'INVALID_CODE',
  INVALID_ACCESS_KEY: 'INVALID_ACCESS_KEY',
  INVALID_REGISTRATION: 'INVALID_REGISTRATION',
  INVALID_RESET_TOKEN: 'INVALID_RESET_TOKEN',
  WRONG_STEP: 'WRONG_STEP',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',
});

module.exports = { AppError, sendError, ERROR_CODES };
