const { Router } = require('express');
const shift = require('../../controllers/user/shiftController');
const authenticate = require('../../middleware/auth/authenticate');
const { requirePermission } = require('../../middleware/auth/authorize');
const { idParam } = require('@pos-cafe/shared/validate');
const { validateShopQuery } = require('../../middleware/validation/roleValidation');
const {
  validateAssign, validateClear, validateRosterQuery, validateShiftCreate, validateShiftStatus, validateShiftUpdate,
} = require('../../middleware/validation/shiftValidation');

const router = Router();

// Shift tab. Signed-in users only; an admin may view, add and edit, but only the owner may delete a shift.
router.use(authenticate, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const perm = (action) => requirePermission('Staff Management', action);

// The weekly roster (the "Staff's Shifts" table). Listed before /:id so "roster" is not read as an id.
router.get('/roster', perm('view'), validateRosterQuery, shift.roster);
router.get('/roster/export', perm('view'), validateRosterQuery, shift.exportRoster);
router.put('/roster/:staffId', perm('edit'), idParam('staffId'), validateAssign, shift.assign);
router.delete('/roster/:staffId', perm('edit'), idParam('staffId'), validateClear, shift.clear);

router.get('/', perm('view'), validateShopQuery, shift.list);
router.post('/', perm('add'), validateShopQuery, validateShiftCreate, shift.create);
router.put('/:id', perm('edit'), idParam('id'), validateShiftUpdate, shift.update);
router.put('/:id/status', perm('edit'), idParam('id'), validateShiftStatus, shift.setStatus);
router.delete('/:id', perm('delete'), idParam('id'), shift.remove);

module.exports = router;
