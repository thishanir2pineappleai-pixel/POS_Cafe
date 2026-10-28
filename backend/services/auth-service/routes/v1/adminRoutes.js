const { Router } = require('express');
const { requireRole } = require('@pos-cafe/shared/authorize');
const { idParam } = require('@pos-cafe/shared/validate');
const { createImageUpload } = require('@pos-cafe/shared/uploads');
const adminController = require('../../controllers/auth/adminController');
const authenticate = require('../../middleware/auth/authenticate');
const { validateAdminCreateBody, validateAdminUpdateBody, validatePasswordBody } = require('../../middleware/validation/adminValidation');

const { uploadImage, requireImage } = createImageUpload();
const router = Router();

// Admin profiles are the login users of an account, so this service owns them (the URL stays /settings/admins for the
// frontend; the Gateway sends it here). Every route needs a signed-in user and works only on that user's own account.
// Creating admins is for the account's owner; editing is the owner, or an admin on their own profile.
// Responses are never cached and never contain a password or hash.
router.use(authenticate);
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const owner = requireRole('owner');

router.get('/', adminController.listAdmins);
router.post('/', owner, validateAdminCreateBody, adminController.createAdmin);
router.get('/:id', idParam('id'), adminController.getAdmin);
router.put('/:id', idParam('id'), validateAdminUpdateBody, adminController.updateAdmin);
router.put('/:id/password', idParam('id'), validatePasswordBody, adminController.changePassword);
router.post('/:id/image', idParam('id'), uploadImage, requireImage, adminController.uploadAdminImage);

module.exports = router;
