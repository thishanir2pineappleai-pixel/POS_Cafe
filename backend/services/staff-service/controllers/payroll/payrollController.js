// Payroll record endpoints (Payroll tab). Owner only (see the routes).
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { MESSAGES } = require('../../config/constants/messages');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const payrollService = require('../../services/payroll/payrollService');
const { sendCsv } = require('../user/exportResponse');

const noStore = (res) => res.set('Cache-Control', 'no-store'); // salary data is never cached

const list = asyncHandler(async (req, res) => {
  noStore(res);
  const { items, meta } = await payrollService.list(req.auth, req.valid.query);
  sendSuccess(res, { data: items, meta });
});
const exportRecords = asyncHandler(async (req, res) => sendCsv(res, req.valid.query.format, 'payroll.csv', payrollService.exportCsv(req.auth, req.valid.query)));
const summary = asyncHandler(async (req, res) => { noStore(res); sendSuccess(res, { data: await payrollService.summary(req.auth, req.valid.query) }); });
const overview = asyncHandler(async (req, res) => { noStore(res); sendSuccess(res, { data: await payrollService.overview(req.auth, req.valid.query) }); });
const get = asyncHandler(async (req, res) => { noStore(res); sendSuccess(res, { data: await payrollService.get(req.auth, req.valid.id) }); });
const create = asyncHandler(async (req, res) => sendSuccess(res, { status: 201, message: MESSAGES.PAYROLL_SAVED, data: await payrollService.create(req.auth, req.valid.body) }));
const update = asyncHandler(async (req, res) => sendSuccess(res, { message: MESSAGES.PAYROLL_SAVED, data: await payrollService.update(req.auth, req.valid.id, req.valid.body) }));
const pay = asyncHandler(async (req, res) => sendSuccess(res, { message: MESSAGES.PAYROLL_PAID, data: await payrollService.pay(req.auth, req.valid.id) }));

module.exports = { list, exportRecords, summary, overview, get, create, update, pay };
