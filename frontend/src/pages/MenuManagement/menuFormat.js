// Display helpers of Menu Management. The products themselves come from the Menu Service (api/productApi.js).
export const PAGE_SIZE = 9;

export const formatPrice = (n) => `Rs. ${Number(n).toFixed(2)}`;

// Status labels as the server sends them (and as the Figma shows them).
export const STATUS_IN_STOCK = 'In Stock';
export const STATUS_LOW_STOCK = 'Low Stock';
export const STATUS_OUT_OF_STOCK = 'Out of stock';

// The filter's values -> what GET /products?status= accepts.
export const STATUS_QUERY = { [STATUS_IN_STOCK]: 'in_stock', [STATUS_LOW_STOCK]: 'low_stock', [STATUS_OUT_OF_STOCK]: 'out_of_stock' };
