// Service-to-service endpoints. They are NOT under /api, the Gateway never forwards them, and every call must carry the
// shared X-Internal-Key.
const { Router } = require('express');
const { requireInternalKey } = require('@pos-cafe/shared/authenticate');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { idParam } = require('@pos-cafe/shared/validate');
const { env } = require('../config');
const { validateFirstShopBody } = require('../middleware/validation/settingsValidation');
const service = require('../services/settings/businessProfileService');

const router = Router();
router.use(requireInternalKey(env.internalKey));

// The shops of an account: [{ id, name, timezone }].
router.get('/accounts/:accountId/shops', idParam('accountId'), asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await service.summariesForAccount(req.valid.accountId) });
}));

// Body { ownerId, name, address, phone }: creates the account's first shop, or returns it when it already exists.
router.put('/accounts/:accountId/first-shop', idParam('accountId'), validateFirstShopBody, asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await service.ensureFirstShop(req.valid.accountId, req.valid.body) });
}));

module.exports = router;
