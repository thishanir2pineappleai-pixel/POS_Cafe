const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { MESSAGES } = require('../../config/constants/messages');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const menuService = require('../../services/menu/menuService');

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await menuService.list(req.valid.query);
  sendSuccess(res, { data: items, meta });
});

const summary = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await menuService.summary() });
});

const get = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await menuService.get(req.valid.id) });
});

const create = asyncHandler(async (req, res) => {
  sendSuccess(res, { status: 201, message: MESSAGES.PRODUCT_CREATED, data: await menuService.create(req.valid.body) });
});

const update = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: MESSAGES.PRODUCT_UPDATED, data: await menuService.update(req.valid.id, req.valid.body) });
});

const remove = asyncHandler(async (req, res) => {
  await menuService.remove(req.valid.id);
  sendSuccess(res, { message: MESSAGES.PRODUCT_DELETED });
});

const updateIngredient = asyncHandler(async (req, res) => {
  const { id, ingredientId, body } = req.valid;
  sendSuccess(res, { message: MESSAGES.INGREDIENT_QUANTITY_UPDATED, data: await menuService.updateIngredientQuantity(id, ingredientId, body.quantity) });
});

module.exports = { list, summary, get, create, update, remove, updateIngredient };
