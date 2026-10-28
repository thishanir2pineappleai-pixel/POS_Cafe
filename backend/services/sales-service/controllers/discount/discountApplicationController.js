// Sales discount applications over HTTP. Every route needs a signed-in user and works on that user's own account only.
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const { MESSAGES } = require('../../config/constants/messages');
const service = require('../../services/discount/discountApplicationService');

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.auth, req.valid.query);
  sendSuccess(res, { data: items, meta });
});

const get = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await service.get(req.auth, req.valid.id) });
});

const create = asyncHandler(async (req, res) => {
  sendSuccess(res, { status: 201, message: MESSAGES.APPLICATION_CREATED, data: await service.create(req.auth, req.valid.body) });
});

const update = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: MESSAGES.APPLICATION_UPDATED, data: await service.update(req.auth, req.valid.id, req.valid.body) });
});

const setStatus = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: MESSAGES.APPLICATION_STATUS_UPDATED, data: await service.setStatus(req.auth, req.valid.id, req.valid.body.status) });
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.auth, req.valid.id);
  sendSuccess(res, { message: MESSAGES.APPLICATION_DELETED });
});

module.exports = { list, get, create, update, setStatus, remove };
