// Messages of the Sales Service. The messages every service answers the same way come from @pos-cafe/shared.
const { MESSAGES: SHARED } = require('@pos-cafe/shared/messages');

const MESSAGES = Object.freeze({
  ...SHARED,
  ORDER_NOT_FOUND: 'Order not found',
  ORDER_CREATED: 'Order created',
  ORDER_UPDATED: 'Order updated',
  ORDER_NOT_EDITABLE: 'Only a Pending order can be changed',
  ORDER_STATUS_UPDATED: 'Order status updated',
  ORDER_TRANSITION_REFUSED: 'The order cannot move to that status from its current one',
  ORDER_NOT_PAYABLE: 'Only a Delivered order can be paid',
  ORDER_ALREADY_PAID: 'The order is already paid',
  ORDER_CHANGED: 'The order was changed by someone else. Reload it and try again',
  PAYMENT_RECORDED: 'Payment recorded',
  ORDER_TOO_LARGE: 'The order total is too large',
  SHOP_NOT_FOUND: 'Shop profile not found',
  SHOP_REQUIRED: 'Create a shop profile first',
  EXPORT_FORMAT_NOT_IMPLEMENTED: 'Only CSV export is available. PDF and XLS export are not implemented yet',
  APPLICATION_NOT_FOUND: 'Discount application not found',
  APPLICATION_CREATED: 'Discount application created',
  APPLICATION_UPDATED: 'Discount application updated',
  APPLICATION_STATUS_UPDATED: 'Discount application status updated',
  APPLICATION_DELETED: 'Discount application deleted',
});

module.exports = { MESSAGES };
