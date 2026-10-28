// Service-to-service endpoints. They are NOT under /api, the Gateway never forwards them, and every call must carry the
// shared X-Internal-Key.
const { Router } = require('express');
const { requireInternalKey } = require('@pos-cafe/shared/authenticate');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('../config/constants/messages');
const { env } = require('../config');
const authService = require('../services/auth/authService');

const router = Router();
router.use(requireInternalKey(env.internalKey));

// Body { sessionId, userId } (from a token the caller already verified). Always 200 with { active, auth? }.
router.post('/sessions/verify', asyncHandler(async (req, res) => {
  const { sessionId, userId } = req.body ?? {};
  if (typeof sessionId !== 'string' || sessionId.length > 64 || !Number.isInteger(userId)) {
    throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, MESSAGES.VALIDATION_FAILED);
  }
  const auth = await authService.verifySession({ sessionId, userId });
  sendSuccess(res, { data: auth ? { active: true, auth } : { active: false } });
}));

module.exports = router;
