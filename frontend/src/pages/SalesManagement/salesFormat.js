// Display helpers of Sales Management. Orders and discount applications come from the Sales Service (api/orderApi.js, api/salesApi.js).
export const ORDERS_PAGE_SIZE = 7;
export const DISCOUNTS_PAGE_SIZE = 12;

// A discount application row as the table and dialogs use it. productIds === null means "All Products".
export const toDiscountRow = (a) => ({
  id: a.id,
  discountId: a.discountId,
  name: a.discountName,
  value: a.value,
  productIds: a.appliesToAll ? null : a.productIds,
  start: a.startDate,
  end: a.endDate,
  status: a.status,
});

export const appliesLabel = (d) => {
  if (d.productIds === null) return 'All Products';
  return d.productIds.length === 1 ? '1 Product' : `${d.productIds.length} Products`;
};
