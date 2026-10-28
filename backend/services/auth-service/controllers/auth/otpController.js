// Signup email and phone code checks and resends. `delivery` in a response tells the truth about whether the message
// left the server ({ delivered: false, reason: 'not_configured' } until a real provider exists).
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const registrationService = require('../../services/auth/registrationService');

const verifyEmail = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await registrationService.verifyEmail(req.valid.body) });
});
const resendEmail = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await registrationService.resendEmail(req.valid.body) });
});
const verifyPhone = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await registrationService.verifyPhone(req.valid.body) });
});
const resendPhone = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await registrationService.resendPhone(req.valid.body) });
});

module.exports = { verifyEmail, resendEmail, verifyPhone, resendPhone };
