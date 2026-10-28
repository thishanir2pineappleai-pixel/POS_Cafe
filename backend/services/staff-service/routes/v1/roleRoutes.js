// Roles & Permission tab: /permissions, /roles and /teams. Reading is for anyone who may view Staff Management; every change is
// the OWNER's only, so an admin can never create a role, edit the permission matrix or widen anyone's access.
// (Each router authenticates itself: they are mounted side by side, so a shared router-level middleware would also catch
// unrelated paths.)
const { Router } = require('express');
const controller = require('../../controllers/user/roleController');
const authenticate = require('../../middleware/auth/authenticate');
const { requirePermission, requireRole } = require('../../middleware/auth/authorize');
const { idParam } = require('@pos-cafe/shared/validate');
const { validateName, validatePermissions, validateShopQuery } = require('../../middleware/validation/roleValidation');

const view = [authenticate, requirePermission('Staff Management', 'view')];
const owner = [authenticate, requireRole('owner')];
const noStore = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };

const permissionRoutes = Router();
permissionRoutes.get('/', ...view, controller.permissions);

function namedRoutes(c) {
  const router = Router();
  router.get('/', ...view, noStore, validateShopQuery, c.list);
  router.post('/', ...owner, validateShopQuery, validateName, c.create);
  router.get('/:id', ...view, noStore, idParam('id'), c.get);
  router.put('/:id', ...owner, idParam('id'), validateName, c.update);
  router.delete('/:id', ...owner, idParam('id'), c.remove);
  return router;
}

const roleRoutes = namedRoutes(controller.roles);
roleRoutes.put('/:id/permissions', ...owner, idParam('id'), validatePermissions, controller.setPermissions);
const teamRoutes = namedRoutes(controller.teams);

module.exports = { permissionRoutes, roleRoutes, teamRoutes };
