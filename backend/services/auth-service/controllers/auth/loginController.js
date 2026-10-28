const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const authService = require('../../services/auth/authService');

// no-store: the response carries an access token.
const login = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  sendSuccess(res, { data: await authService.login(req.valid.body) });
});

module.exports = { login };
