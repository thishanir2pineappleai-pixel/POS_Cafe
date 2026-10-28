// Messages of the Settings Service. The messages every service answers the same way come from @pos-cafe/shared.
const { MESSAGES: SHARED } = require('@pos-cafe/shared/messages');

const MESSAGES = Object.freeze({
  ...SHARED,
  SHOP_NOT_FOUND: 'Shop profile not found',
  SHOP_CREATED: 'Shop profile created',
  SHOP_UPDATED: 'Shop profile updated',
  SHOP_IMAGE_UPLOADED: 'Shop logo uploaded',
});

module.exports = { MESSAGES };
