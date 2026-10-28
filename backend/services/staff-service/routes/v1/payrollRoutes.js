const { Router } = require('express');
const deductions = require('../../controllers/payroll/payrollDeductionController');
const payroll = require('../../controllers/payroll/payrollController');
const rewards = require('../../controllers/payroll/payrollRewardController');
const authenticate = require('../../middleware/auth/authenticate');
const { requireRole } = require('../../middleware/auth/authorize');
const { idParam } = require('@pos-cafe/shared/validate');
const {
  validateDeduction, validateEntryQuery, validateRecordCreate, validateRecordQuery, validateRecordUpdate, validateReward, validateSummaryQuery,
} = require('../../middleware/validation/payrollValidation');

const router = Router();

// Payroll is salary data: signed-in OWNER only, never cached.
router.use(authenticate, requireRole('owner'), (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.get('/summary', validateSummaryQuery, payroll.summary);
router.get('/overview', validateSummaryQuery, payroll.overview);

router.get('/records', validateRecordQuery, payroll.list);
router.get('/records/export', validateRecordQuery, payroll.exportRecords);
router.post('/records', validateRecordCreate, payroll.create);
router.get('/records/:id', idParam('id'), payroll.get);
router.put('/records/:id', idParam('id'), validateRecordUpdate, payroll.update);
router.post('/records/:id/pay', idParam('id'), payroll.pay);

function entryRoutes(path, c, validateBody) {
  router.get(path, validateEntryQuery, c.list);
  router.get(`${path}/export`, validateEntryQuery, c.exportCsv);
  router.post(path, validateBody, c.create);
  router.get(`${path}/:id`, idParam('id'), c.get);
  router.put(`${path}/:id`, idParam('id'), validateBody, c.update);
  router.delete(`${path}/:id`, idParam('id'), c.remove);
}
entryRoutes('/rewards', rewards, validateReward);
entryRoutes('/deductions', deductions, validateDeduction);

module.exports = router;
