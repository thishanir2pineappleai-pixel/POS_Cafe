// Service-to-service endpoints. They are NOT under /api, the Gateway never forwards them, and every call must carry the
// shared X-Internal-Key. Used by the Sales Service (order prices, discount applications, the Dashboard stock card).
const { Router } = require('express');
const { requireInternalKey } = require('@pos-cafe/shared/authenticate');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { validate, notAnObject, isPlainObject } = require('@pos-cafe/shared/validate');
const { toInt } = require('@pos-cafe/shared/validator');
const { env } = require('../config');
const { MESSAGES } = require('../config/constants/messages');
const service = require('../services/menu/internalService');

const MAX_LOOKUP_IDS = 100;

// Body { ids: [positive whole numbers] }, at most 100, duplicates ignored.
function parseLookupBody(req) {
  if (!isPlainObject(req.body)) return notAnObject();
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_LOOKUP_IDS) {
    return { value: null, errors: [{ field: 'ids', message: `Must be a list of 1-${MAX_LOOKUP_IDS} product ids` }] };
  }
  const parsed = ids.map((id) => (typeof id === 'number' ? toInt(id, { min: 1 }) : null));
  if (parsed.some((id) => id === null)) return { value: null, errors: [{ field: 'ids', message: 'Every id must be a positive whole number' }] };
  return { value: { ids: [...new Set(parsed)] }, errors: [] };
}

const router = Router();
router.use(requireInternalKey(env.internalKey));

// The products that exist among the given ids: [{ id, name, categoryName, sellingPrice, image }].
router.post('/products/lookup', validate(parseLookupBody), asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await service.lookupProducts(req.valid.body.ids) });
}));

// The discount definitions that exist among the given ids: [{ id, name, percentage }]. (Same body as products/lookup. A
// lookup answers 200 with fewer rows rather than 404, because the shared internal client treats every non-2xx as 503.)
router.post('/discounts/lookup', validate(parseLookupBody), asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await service.lookupDiscounts(req.valid.body.ids) });
}));

// Stock counts and the products that need attention. ?limit= 1-20 (default 4).
router.get('/stock-overview', asyncHandler(async (req, res) => {
  const limit = req.query.limit === undefined ? 4 : toInt(req.query.limit, { min: 1, max: 20 });
  if (limit === null) throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, MESSAGES.VALIDATION_FAILED, [{ field: 'limit', message: 'Must be a whole number from 1 to 20' }]);
  sendSuccess(res, { data: await service.stockOverview(limit) });
}));

module.exports = router;
