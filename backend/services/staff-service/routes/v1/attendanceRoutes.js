const { Router } = require('express');
const attendance = require('../../controllers/attendance/attendanceController');
const authenticate = require('../../middleware/auth/authenticate');
const { requirePermission } = require('../../middleware/auth/authorize');
const { idParam } = require('@pos-cafe/shared/validate');
const {
  validateCheck, validateDayList, validateDayOnly, validateLeave, validateLeaveQuery,
} = require('../../middleware/validation/attendanceValidation');

const router = Router();

// Attendance tab and Leave Management. Signed-in users only; an admin may view, record and edit, only the owner may delete a leave.
router.use(authenticate, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const perm = (action) => requirePermission('Staff Management', action);

router.get('/', perm('view'), validateDayList, attendance.list);
router.get('/summary', perm('view'), validateDayList, attendance.summary);
router.get('/export', perm('view'), validateDayList, attendance.exportAttendance);
router.post('/check-in', perm('add'), validateCheck, attendance.checkIn);
router.post('/check-out', perm('edit'), validateCheck, attendance.checkOut);

// Leave management. Listed before /staff/:staffId so "leaves" is never read as an id.
router.get('/leaves', perm('view'), validateLeaveQuery, attendance.leaveList);
router.get('/leaves/summary', perm('view'), validateLeaveQuery, attendance.leaveSummary);
router.get('/leaves/export', perm('view'), validateLeaveQuery, attendance.leaveExport);
router.post('/leaves', perm('add'), validateLeave, attendance.leaveCreate);
router.get('/leaves/:id', perm('view'), idParam('id'), attendance.leaveGet);
router.put('/leaves/:id', perm('edit'), idParam('id'), validateLeave, attendance.leaveUpdate);
router.delete('/leaves/:id', perm('delete'), idParam('id'), attendance.leaveRemove);

router.get('/staff/:staffId', perm('view'), idParam('staffId'), validateDayOnly, attendance.detail);

module.exports = router;
