// Menu discount definitions (name and percentage). The file lives under payment/ because the project
// structure puts discountController there.
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { MESSAGES } = require('../../config/constants/messages');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const discountService = require('../../services/discount/discountService');

const list = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await discountService.list() });
});

const create = asyncHandler(async (req, res) => {
  sendSuccess(res, { status: 201, message: MESSAGES.DISCOUNT_CREATED, data: await discountService.create(req.valid.body) });
});

module.exports = { list, create };
