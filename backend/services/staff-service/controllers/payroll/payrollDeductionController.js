// Deduction endpoints (owner only).
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { MESSAGES } = require('../../config/constants/messages');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const { deductionService: service } = require('../../services/payroll/payrollRewardService');
const { sendCsv } = require('../user/exportResponse');

module.exports = {
  list: asyncHandler(async (req, res) => { res.set('Cache-Control', 'no-store'); const { items, meta } = await service.list(req.auth, req.valid.query); sendSuccess(res, { data: items, meta }); }),
  exportCsv: asyncHandler(async (req, res) => sendCsv(res, req.valid.query.format, 'deductions.csv', service.exportCsv(req.auth, req.valid.query))),
  get: asyncHandler(async (req, res) => sendSuccess(res, { data: await service.get(req.auth, req.valid.id) })),
  create: asyncHandler(async (req, res) => sendSuccess(res, { status: 201, message: MESSAGES.DEDUCTION_SAVED, data: await service.create(req.auth, req.valid.body) })),
  update: asyncHandler(async (req, res) => sendSuccess(res, { message: MESSAGES.DEDUCTION_SAVED, data: await service.update(req.auth, req.valid.id, req.valid.body) })),
  remove: asyncHandler(async (req, res) => { await service.remove(req.auth, req.valid.id); sendSuccess(res, { message: MESSAGES.DEDUCTION_DELETED }); }),
};
