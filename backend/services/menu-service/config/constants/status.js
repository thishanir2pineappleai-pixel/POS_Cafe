// Stock status values shown in Menu Management (labels copied from the Figma).
const STOCK_STATUS = Object.freeze({
  IN_STOCK: 'In Stock',
  LOW_STOCK: 'Low Stock',
  OUT_OF_STOCK: 'Out of stock',
});

// Values accepted by GET /products?status=
const STATUS_FILTERS = Object.freeze({
  in_stock: STOCK_STATUS.IN_STOCK,
  low_stock: STOCK_STATUS.LOW_STOCK,
  out_of_stock: STOCK_STATUS.OUT_OF_STOCK,
});

// CONFIRMED: quantity 0 is "Out of stock" (Figma samples).
// PENDING APPROVAL: the Figma says "Low Stock Alert (When Quantity goes below)", so Low Stock is quantity strictly
//   below the alert. The frontend mock currently uses "at or below"; the two differ only when quantity equals the alert.
// NO DEFAULT is assumed for the alert: a product without one can only be In Stock or Out of stock.
function getStockStatus(quantity, lowStockAlert) {
  if (quantity <= 0) return STOCK_STATUS.OUT_OF_STOCK;
  if (lowStockAlert !== null && lowStockAlert !== undefined && quantity < lowStockAlert) return STOCK_STATUS.LOW_STOCK;
  return STOCK_STATUS.IN_STOCK;
}

module.exports = { STOCK_STATUS, STATUS_FILTERS, getStockStatus };
