// Messages for the errors every service answers the same way.
const MESSAGES = Object.freeze({
  ROUTE_NOT_FOUND: 'Route not found',
  MALFORMED_JSON: 'Malformed JSON body',
  PAYLOAD_TOO_LARGE: 'Request body is too large',
  INTERNAL: 'Something went wrong',
  VALIDATION_FAILED: 'Validation failed',
  IMAGE_MISSING: 'No image uploaded. Send one JPG or PNG file in the "image" field',
  IMAGE_TOO_LARGE: 'Image must be 2 MB or smaller',
  IMAGE_UNSUPPORTED: 'Only JPG and PNG images are accepted',
  AUTH_REQUIRED: 'Authentication required',
  AUTH_INVALID: 'Your session is invalid or has expired. Please sign in again',
  FORBIDDEN: 'You are not allowed to do this',
  TOO_MANY: 'Too many attempts. Please try again later',
  AUTH_SERVICE_UNAVAILABLE: 'The authentication service is unavailable. Please try again shortly',
  SERVICE_UNAVAILABLE: 'This service is temporarily unavailable. Please try again shortly',
  GATEWAY_TIMEOUT: 'The service took too long to answer. Please try again',
});

module.exports = { MESSAGES };
