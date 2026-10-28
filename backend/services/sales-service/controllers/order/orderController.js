// Orders over HTTP. Every route needs a signed-in user (req.auth) and works on that user's own account only.
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const { MESSAGES } = require('../../config/constants/messages');
const orderService = require('../../services/order/orderService');

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await orderService.list(req.auth, req.valid.query);
  sendSuccess(res, { data: items, meta });
});

// CSV only. PDF and XLS need a format decision and a library, so they answer 501 for now.
const exportOrders = asyncHandler(async (req, res) => {
  const { format, ...filters } = req.valid.query;
  if (format !== 'csv') throw new AppError(501, ERROR_CODES.NOT_IMPLEMENTED, MESSAGES.EXPORT_FORMAT_NOT_IMPLEMENTED);
  const csv = await orderService.exportCsv(req.auth, filters);
  res.status(200)
    .set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="sales-orders.csv"' })
    .send(csv);
});

const get = asyncHandler(async (req, res) => {
  sendSuccess(res, { data: await orderService.get(req.auth, req.valid.id) });
});

const create = asyncHandler(async (req, res) => {
  sendSuccess(res, { status: 201, message: MESSAGES.ORDER_CREATED, data: await orderService.create(req.auth, req.valid.body) });
});

const update = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: MESSAGES.ORDER_UPDATED, data: await orderService.update(req.auth, req.valid.id, req.valid.body) });
});

const setStatus = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: MESSAGES.ORDER_STATUS_UPDATED, data: await orderService.setStatus(req.auth, req.valid.id, req.valid.body.status) });
});

const pay = asyncHandler(async (req, res) => {
  sendSuccess(res, { status: 201, message: MESSAGES.PAYMENT_RECORDED, data: await orderService.pay(req.auth, req.valid.id, req.valid.body) });
});

module.exports = { list, exportOrders, get, create, update, setStatus, pay };
