const { Router } = require('express');
const { requireRole } = require('@pos-cafe/shared/authorize');
const { idParam } = require('@pos-cafe/shared/validate');
const { createImageUpload } = require('@pos-cafe/shared/uploads');
const businessController = require('../../controllers/settings/businessController');
const settingsController = require('../../controllers/settings/settingsController');
const { validateShopBody } = require('../../middleware/validation/settingsValidation');

const { uploadImage, requireImage } = createImageUpload();

// Every Settings route needs a signed-in user and works only on that user's own account (see the services).
// Creating shops is for the account's owner; editing is any signed-in user of the account.
// `authenticate` is injected by createApp (it asks the Auth Service whether the session is still active).
module.exports = ({ authenticate }) => {
  const router = Router();
  router.use(authenticate);
  const owner = requireRole('owner');

  router.get('/timezones', settingsController.timezones);

  router.get('/shops', businessController.list);
  router.post('/shops', owner, validateShopBody, businessController.create);
  router.get('/shops/:id', idParam('id'), businessController.get);
  router.put('/shops/:id', idParam('id'), validateShopBody, businessController.update);
  router.post('/shops/:id/image', idParam('id'), uploadImage, requireImage, businessController.uploadImage);

  return router;
};
