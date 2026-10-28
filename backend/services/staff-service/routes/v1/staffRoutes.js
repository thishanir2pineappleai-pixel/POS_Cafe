const { Router } = require('express');
const { policy } = require('../../config');
const { DOCUMENT_TYPES } = require('../../services/storage/documentService');
const staff = require('../../controllers/user/staffController');
const authenticate = require('../../middleware/auth/authenticate');
const { requirePermission, requireRole } = require('../../middleware/auth/authorize');
const { rateLimit } = require('../../middleware/security/rateLimiter');
const { fail, idParam } = require('@pos-cafe/shared/validate');
const { validateShopQuery } = require('../../middleware/validation/roleValidation');
const {
  validateStaffCreate, validateStaffQuery, validateStaffStatus, validateStaffUpdate,
} = require('../../middleware/validation/staffValidation');
const { createImageUpload } = require('@pos-cafe/shared/uploads');
const { uploadDocument } = require('../../middleware/upload/documentMiddleware');

const { uploadImage, requireImage } = createImageUpload();
const router = Router();

// Every route needs a signed-in user and works only on staff of that user's own account (see staffService).
// Responses hold personal data, so they are never cached. Permissions: the Owner may do everything, an Admin may view, add
// and edit but not delete, and only the Owner sees or changes salary, EPF/ETF and documents (checked in the service).
router.use(authenticate, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const perm = (action) => requirePermission('Staff Management', action);
const byUser = (req) => String(req.auth.userId);
const writeLimit = rateLimit({ name: 'staffWrite', ...policy.rateLimits.staffWrite, key: byUser });
const uploadLimit = rateLimit({ name: 'staffUpload', ...policy.rateLimits.staffUpload, key: byUser });
const slotParam = (req, res, next) => {
  if (!DOCUMENT_TYPES.includes(req.params.slot)) return next(fail([{ field: 'slot', message: `Must be one of: ${DOCUMENT_TYPES.join(', ')}` }]));
  req.valid = { ...req.valid, slot: req.params.slot };
  return next();
};

router.get('/summary', perm('view'), validateStaffQuery, staff.summary);
router.get('/', perm('view'), validateStaffQuery, staff.list);
router.post('/', perm('add'), writeLimit, validateShopQuery, validateStaffCreate, staff.create);

router.get('/:id', perm('view'), idParam('id'), staff.get);
router.patch('/:id', perm('edit'), writeLimit, idParam('id'), validateStaffUpdate, staff.update);
router.put('/:id/status', perm('edit'), writeLimit, idParam('id'), validateStaffStatus, staff.setStatus);
router.delete('/:id', perm('delete'), writeLimit, idParam('id'), staff.remove);
router.post('/:id/restore', perm('delete'), writeLimit, idParam('id'), staff.restore);

router.get('/:id/image', perm('view'), idParam('id'), staff.image);
router.post('/:id/image', perm('edit'), uploadLimit, idParam('id'), uploadImage, requireImage, staff.uploadImage);

// Documents are Employment Records: owner only.
router.post('/:id/documents/:slot', requireRole('owner'), uploadLimit, idParam('id'), slotParam, uploadDocument, staff.uploadDocument);
router.get('/:id/documents/:slot', requireRole('owner'), idParam('id'), slotParam, staff.document);

module.exports = router;
