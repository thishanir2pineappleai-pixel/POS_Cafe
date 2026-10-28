const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { MESSAGES } = require('../../config/constants/messages');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const authService = require('../../services/auth/authService');

// Revokes the session behind the token that made the request; that token stops working immediately.
const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.auth);
  sendSuccess(res, { message: MESSAGES.LOGGED_OUT });
});

module.exports = { logout };
