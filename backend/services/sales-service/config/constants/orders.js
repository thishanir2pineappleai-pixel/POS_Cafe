// Order vocabulary taken from the original single backend (labels from the Figma); that backend is not part of this repository.
//
// LIFECYCLE (what the requirements support, and what is an inference):
//   Pending --barista--> Preparing --barista--> Delivered --payment--> Paid
//   * BRD BR-04: the barista can "mark [orders] as in progress, and complete them"   -> Pending -> Preparing -> Delivered.
//     PENDING APPROVAL: "in progress" = Preparing and "complete" = Delivered are inferred from the status names in the designs.
//   * BRD BR-05: payment by cash or card "upon order completion"                       -> a Delivered order is paid -> Paid.
//   * Cancelled exists in the designs but NO document says who may cancel, from which status, or whether a paid order can be
//     refunded. So there is NO route that cancels or refunds; Cancelled orders can only come from outside (the original data).
// The table below is the only place that decides the barista transitions; the payment step is in orderService.pay.
const ORDER_STATUS = Object.freeze({
  PAID: 'Paid',
  PREPARING: 'Preparing',
  PENDING: 'Pending',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
});
const ORDER_TYPES = Object.freeze({ TAKE_AWAY: 'Take Away', DINE_IN: 'Dine-In' });
const INITIAL_ORDER_STATUS = ORDER_STATUS.PENDING;
const STATUS_TRANSITIONS = Object.freeze({
  [ORDER_STATUS.PENDING]: [ORDER_STATUS.PREPARING],
  [ORDER_STATUS.PREPARING]: [ORDER_STATUS.DELIVERED],
});
const PAYABLE_STATUS = ORDER_STATUS.DELIVERED;
// BRD BR-05 names cash and card only. No split payments, no partial payments, no tips (no rule): one payment of the full total.
const PAYMENT_METHODS = Object.freeze({ CASH: 'Cash', CARD: 'Card' });
const DISCOUNT_APPLICATION_STATUS = Object.freeze({ ACTIVE: 'Active', INACTIVE: 'Inactive' });

// Sanity limits (PENDING APPROVAL, nothing in the requirements states them).
const LIMITS = Object.freeze({ maxLines: 100, maxQuantity: 999, maxTotalCents: 9999999999 });

module.exports = {
  ORDER_STATUS, ORDER_TYPES, INITIAL_ORDER_STATUS, STATUS_TRANSITIONS, PAYABLE_STATUS, PAYMENT_METHODS, DISCOUNT_APPLICATION_STATUS, LIMITS,
};
