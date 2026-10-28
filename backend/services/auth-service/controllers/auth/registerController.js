// Signup steps that are not code checks (see otpController for those). Every response is safe to show: no code, key,
// password or hash is ever included.
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { MESSAGES } = require('../../config/constants/messages');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const registrationService = require('../../services/auth/registrationService');

const credentials = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  sendSuccess(res, { status: 201, data: await registrationService.start(req.valid.body) });
});

const owner = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await registrationService.setOwner(req.valid.body) });
});

const business = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await registrationService.setBusiness(req.valid.body) });
});

const activate = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: MESSAGES.ACCOUNT_ACTIVATED, data: await registrationService.activate(req.valid.body) });
});

const resendAccessKey = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: MESSAGES.ACCESS_KEY_REQUESTED, data: await registrationService.resendAccessKey(req.valid.body) });
});

module.exports = { credentials, owner, business, activate, resendAccessKey };
