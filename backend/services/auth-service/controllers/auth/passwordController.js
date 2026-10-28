const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { MESSAGES } = require('../../config/constants/messages');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const authService = require('../../services/auth/authService');

// The answer is identical for every email, registered or not.
const forgotPassword = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: MESSAGES.FORGOT_PASSWORD_REQUESTED, data: await authService.requestPasswordReset(req.valid.body) });
});

const verifyResetCode = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  sendSuccess(res, { data: await authService.verifyPasswordResetCode(req.valid.body) });
});

const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.valid.body);
  sendSuccess(res, { message: MESSAGES.PASSWORD_RESET });
});

module.exports = { forgotPassword, verifyResetCode, resetPassword };
