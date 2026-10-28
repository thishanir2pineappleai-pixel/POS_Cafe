// Checks for the Sales > Manage Discount flows. The designs show no error states, so these only flag missing choices.
export function validateDiscountDraft({ name, start, end }) {
  const errors = {};
  if (!name) errors.name = 'Select a discount';
  if (!start || !end) errors.dates = 'Select a start date and an end date';
  return errors;
}

export function validateProductSelection({ mode, productIds }) {
  if (!mode) return 'Choose All Products or Select Products';
  if (mode === 'selected' && productIds.length === 0) return 'Select at least one product';
  return '';
}
