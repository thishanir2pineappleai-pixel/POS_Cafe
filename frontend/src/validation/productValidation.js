// Minimal required-field check for the Add / Edit Menu Item form.
// The designs show no error states, so this only flags the empty required fields.
export const parsePrice = (value) => Number(String(value).replace(/^\s*rs\.?/i, '').replace(/[^0-9.]/g, '')) || 0;

export function validateProduct(values) {
  const errors = {};
  if (!values.name.trim()) errors.name = true;
  if (!values.category) errors.category = true;
  if (!/\d/.test(values.sellingPrice)) errors.sellingPrice = true;
  if (!/^\d+$/.test(String(values.quantity).trim())) errors.quantity = true;
  return errors;
}
