// Sales Management table text. PENDING APPROVAL: the Figma shows both "Iced Latte,Muffin" and
// "3x Cappuccino, 2x Croissants"; items are always written as "<quantity>x <name>" here.
const formatItemsText = (items) => items.map((i) => `${i.quantity}x ${i.name}`).join(', ');

// "Applies To" column: All Products / 1 Product / 8 Products.
const formatAppliesTo = (appliesToAll, productCount) => {
  if (appliesToAll) return 'All Products';
  return productCount === 1 ? '1 Product' : `${productCount} Products`;
};

module.exports = { formatItemsText, formatAppliesTo };
