const { Router } = require('express');
const { requireRole } = require('@pos-cafe/shared/authorize');
const { idParam } = require('@pos-cafe/shared/validate');
const orderController = require('../../controllers/order/orderController');
const reportController = require('../../controllers/reports/reportController');
const applicationController = require('../../controllers/discount/discountApplicationController');
const {
  validateOrderQuery, validateExportQuery, validateSummaryQuery, validateDashboardQuery, validateOrderBody, validateStatusBody, validatePaymentBody,
} = require('../../middleware/validation/orderValidation');
const {
  validateApplicationBody, validateApplicationStatusBody, validateApplicationQuery,
} = require('../../middleware/validation/discountApplicationValidation');

// Mounted at /api/v1 behind `authenticate` (injected by createApp: the token is verified here and the Auth Service confirms
// the session). Every route works on the signed-in user's own account.
// Permissions (PENDING APPROVAL, the migration plan's suggestion): owner and admin may view, create and edit; deleting a
// discount application is for the owner only.
module.exports = () => {
  const router = Router();

  // Orders. /orders/export must stay above /orders/:id.
  router.get('/orders', validateOrderQuery, orderController.list);
  router.get('/orders/export', validateExportQuery, orderController.exportOrders);
  router.post('/orders', validateOrderBody, orderController.create);
  router.get('/orders/:id', idParam('id'), orderController.get);
  router.put('/orders/:id', idParam('id'), validateOrderBody, orderController.update);
  router.patch('/orders/:id/status', idParam('id'), validateStatusBody, orderController.setStatus);
  router.post('/orders/:id/payments', idParam('id'), validatePaymentBody, orderController.pay);

  // The four Sales Management cards.
  router.get('/reports/sales/summary', validateSummaryQuery, reportController.salesSummary);

  // Dashboard (served here because it is computed from orders; only `stock` comes from the Menu Service).
  router.get('/dashboard/summary', validateDashboardQuery, reportController.summary);
  router.get('/dashboard/sales-trend', validateDashboardQuery, reportController.salesTrend);
  router.get('/dashboard/top-selling', validateDashboardQuery, reportController.topSelling);
  router.get('/dashboard/order-status', validateDashboardQuery, reportController.orderStatus);
  router.get('/dashboard/stock', validateDashboardQuery, reportController.stock);
  router.get('/dashboard/recent-orders', validateDashboardQuery, reportController.recentOrders);

  // Discount applications (a Menu discount definition applied over a period to all or selected products).
  router.get('/discounts/applications', validateApplicationQuery, applicationController.list);
  router.post('/discounts/applications', validateApplicationBody, applicationController.create);
  router.get('/discounts/applications/:id', idParam('id'), applicationController.get);
  router.put('/discounts/applications/:id', idParam('id'), validateApplicationBody, applicationController.update);
  router.patch('/discounts/applications/:id/status', idParam('id'), validateApplicationStatusBody, applicationController.setStatus);
  router.delete('/discounts/applications/:id', idParam('id'), requireRole('owner'), applicationController.remove);

  return router;
};
