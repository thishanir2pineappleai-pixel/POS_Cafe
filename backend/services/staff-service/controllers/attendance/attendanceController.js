// Attendance and leave endpoints (Attendance tab).
const asyncHandler = require('@pos-cafe/shared/middleware/asyncHandler');
const { MESSAGES } = require('../../config/constants/messages');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const attendanceService = require('../../services/attendance/attendanceService');
const { sendCsv } = require('../user/exportResponse');

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await attendanceService.list(req.auth, req.valid.query);
  sendSuccess(res, { data: items, meta });
});
const summary = asyncHandler(async (req, res) => sendSuccess(res, { data: await attendanceService.summary(req.auth, req.valid.query) }));
const exportAttendance = asyncHandler(async (req, res) => sendCsv(res, req.valid.query.format, 'attendance.csv', attendanceService.exportCsv(req.auth, req.valid.query)));
const checkIn = asyncHandler(async (req, res) => sendSuccess(res, { status: 201, message: MESSAGES.CHECKED_IN, data: await attendanceService.checkIn(req.auth, req.valid.body) }));
const checkOut = asyncHandler(async (req, res) => sendSuccess(res, { message: MESSAGES.CHECKED_OUT, data: await attendanceService.checkOut(req.auth, req.valid.body) }));
const detail = asyncHandler(async (req, res) => sendSuccess(res, { data: await attendanceService.detail(req.auth, req.valid.staffId, req.valid.query) }));

const leaveList = asyncHandler(async (req, res) => {
  const { items, meta } = await attendanceService.leaveList(req.auth, req.valid.query);
  sendSuccess(res, { data: items, meta });
});
const leaveSummary = asyncHandler(async (req, res) => sendSuccess(res, { data: await attendanceService.leaveSummary(req.auth, req.valid.query) }));
const leaveExport = asyncHandler(async (req, res) => sendCsv(res, req.valid.query.format, 'leaves.csv', attendanceService.leaveExportCsv(req.auth, req.valid.query)));
const leaveGet = asyncHandler(async (req, res) => sendSuccess(res, { data: await attendanceService.leaveGet(req.auth, req.valid.id) }));
const leaveCreate = asyncHandler(async (req, res) => sendSuccess(res, { status: 201, message: MESSAGES.LEAVE_SAVED, data: await attendanceService.leaveCreate(req.auth, req.valid.body) }));
const leaveUpdate = asyncHandler(async (req, res) => sendSuccess(res, { message: MESSAGES.LEAVE_SAVED, data: await attendanceService.leaveUpdate(req.auth, req.valid.id, req.valid.body) }));
const leaveRemove = asyncHandler(async (req, res) => { await attendanceService.leaveRemove(req.auth, req.valid.id); sendSuccess(res, { message: MESSAGES.LEAVE_DELETED }); });

module.exports = { list, summary, exportAttendance, checkIn, checkOut, detail, leaveList, leaveSummary, leaveExport, leaveGet, leaveCreate, leaveUpdate, leaveRemove };
