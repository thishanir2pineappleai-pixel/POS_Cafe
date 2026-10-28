// Shift and roster endpoints (Shift tab).
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { MESSAGES } = require('../../config/constants/messages');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const shiftService = require('../../services/user/shiftService');
const { sendCsv } = require('./exportResponse');

const shopOf = (req) => req.valid.query?.shopId;

const list = asyncHandler(async (req, res) => sendSuccess(res, { data: await shiftService.list(req.auth, { shopId: shopOf(req) }) }));
const create = asyncHandler(async (req, res) => sendSuccess(res, { status: 201, message: MESSAGES.SHIFT_SAVED, data: await shiftService.create(req.auth, shopOf(req), req.valid.body) }));
const update = asyncHandler(async (req, res) => sendSuccess(res, { message: MESSAGES.SHIFT_SAVED, data: await shiftService.update(req.auth, req.valid.id, req.valid.body) }));
const setStatus = asyncHandler(async (req, res) => sendSuccess(res, { message: MESSAGES.SHIFT_STATUS_UPDATED, data: await shiftService.setStatus(req.auth, req.valid.id, req.valid.body) }));
const remove = asyncHandler(async (req, res) => { await shiftService.remove(req.auth, req.valid.id); sendSuccess(res, { message: MESSAGES.SHIFT_DELETED }); });

const roster = asyncHandler(async (req, res) => {
  const { items, meta } = await shiftService.roster(req.auth, req.valid.query);
  sendSuccess(res, { data: items, meta });
});
const exportRoster = asyncHandler(async (req, res) => sendCsv(res, req.valid.query.format, 'staff-shifts.csv', shiftService.exportRoster(req.auth, req.valid.query)));
const assign = asyncHandler(async (req, res) => sendSuccess(res, { message: MESSAGES.ROSTER_UPDATED, data: await shiftService.assign(req.auth, req.valid.staffId, req.valid.body) }));
const clear = asyncHandler(async (req, res) => { await shiftService.clear(req.auth, req.valid.staffId, req.valid.query); sendSuccess(res, { message: MESSAGES.ROSTER_CLEARED }); });

module.exports = { list, create, update, setStatus, remove, roster, exportRoster, assign, clear };
