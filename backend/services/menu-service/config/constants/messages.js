// Messages of the Menu Service. The messages every service answers the same way come from @pos-cafe/shared.
const { MESSAGES: SHARED } = require('@pos-cafe/shared/messages');

const MESSAGES = Object.freeze({
  ...SHARED,
  CATEGORY_CREATED: 'Category created',
  DISCOUNT_CREATED: 'Discount created',
  IMAGE_UPLOADED: 'Product image uploaded',
  INGREDIENT_CREATED: 'Ingredient created',
  PRODUCT_CREATED: 'Product created',
  PRODUCT_UPDATED: 'Product updated',
  PRODUCT_DELETED: 'Product deleted',
  INGREDIENT_QUANTITY_UPDATED: 'Ingredient quantity updated',
  PRODUCT_NOT_FOUND: 'Product not found',
  DISCOUNT_NOT_FOUND: 'Discount not found',
  INGREDIENT_NOT_LINKED: 'This ingredient is not part of the product',
});

module.exports = { MESSAGES };
