// Messages of the Auth Service. The messages every service answers the same way come from @pos-cafe/shared.
const { MESSAGES: SHARED } = require('@pos-cafe/shared/messages');

const MESSAGES = Object.freeze({
  ...SHARED,
  ADMIN_NOT_FOUND: 'Admin profile not found',
  ADMIN_CREATED: 'Admin profile created',
  ADMIN_UPDATED: 'Admin profile updated',
  ADMIN_IMAGE_UPLOADED: 'Admin picture uploaded',
  ADMIN_EMAIL_TAKEN: 'An admin profile with this email already exists',
  PASSWORD_UPDATED: 'Password updated',
  LOGGED_OUT: 'Signed out',
  FORGOT_PASSWORD_REQUESTED: 'If an account exists for this email, a reset code has been requested',
  PASSWORD_RESET: 'Password reset',
  ACCOUNT_ACTIVATED: 'Account activated',
  ACCESS_KEY_REQUESTED: 'If a pending sign-up exists for this email, a new access key has been requested',
  VALIDATION_FAILED: 'Validation failed',
  LOGIN_FAILED: 'Incorrect email or password',
  CODE_INVALID: 'The code is invalid or has expired',
  RESET_TOKEN_INVALID: 'This password reset request is invalid or has expired. Please start again',
  ACCESS_KEY_INVALID: 'Invalid access key',
  REGISTRATION_INVALID: 'This sign-up session is invalid or has expired. Please start again',
  WRONG_STEP: 'This step is not available yet',
});

module.exports = { MESSAGES };
