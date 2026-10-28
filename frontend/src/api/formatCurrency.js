// Currency formats copied from the Sales Management designs.
export const formatLKR = (n) => `LKR ${Math.round(n).toLocaleString('en-US').replace(/,/g, ', ')}`; // LKR 45, 234
export const formatRs = (n) => `Rs. ${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; // Rs. 1,240.00
export const formatRS = (n) => `RS ${Number(n).toFixed(2)}`; // RS 500.00
