// Shop profiles (the Business Profile), scoped to the signed-in user's account. There is no delete: the designs show none.
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { MESSAGES } = require('../../config/constants/messages');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const service = require('../../services/settings/businessProfileService');

const list = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await service.list(req.auth) });
});

const get = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await service.get(req.auth, req.valid.id) });
});

const create = asyncHandler(async (req, res) => {
  sendSuccess(res, { status: 201, message: MESSAGES.SHOP_CREATED, data: await service.create(req.auth, req.valid.body) });
});

const update = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: MESSAGES.SHOP_UPDATED, data: await service.update(req.auth, req.valid.id, req.valid.body) });
});

// Runs after uploadImage and requireImage, so req.file is a checked JPEG or PNG.
const uploadImage = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: MESSAGES.SHOP_IMAGE_UPLOADED, data: await service.setImage(req.auth, req.valid.id, req.file.buffer, req.imageType) });
});

module.exports = { list, get, create, update, uploadImage };
