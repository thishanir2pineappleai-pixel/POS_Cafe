// Decides WHICH SHOP a Sales request works on. Orders belong to a shop, and the shop always comes from the caller's own account,
// never from a request body without a check:
//   * a shopId is accepted only when that shop belongs to the caller's account (otherwise 404, as if it did not exist);
//   * without one, resolveShop uses the account's first shop (lowest id) and returns null when the account has no shop;
//   * requireShop answers 409 when there is no shop to work on (an order needs one).
// The shops are owned by the Settings Service and asked there; when it cannot be reached the request fails with 503.
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('../config/constants/messages');
const settingsClient = require('./integration/settingsClient');

async function ownShopIds(auth) {
  return (await settingsClient.listShops(auth.accountId)).map((s) => s.id).sort((a, b) => a - b);
}

// A requested shop id that belongs to the account (404 otherwise); undefined when none was requested.
async function checkShop(auth, requested) {
  if (requested === undefined || requested === null) return undefined;
  if (!(await ownShopIds(auth)).includes(requested)) throw new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.SHOP_NOT_FOUND);
  return requested;
}

async function resolveShop(auth, requested) {
  const ids = await ownShopIds(auth);
  if (requested !== undefined && requested !== null) {
    if (!ids.includes(requested)) throw new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.SHOP_NOT_FOUND);
    return requested;
  }
  return ids[0] ?? null;
}

async function requireShop(auth, requested) {
  const shopId = await resolveShop(auth, requested);
  if (shopId === null) throw new AppError(409, ERROR_CODES.CONFLICT, MESSAGES.SHOP_REQUIRED);
  return shopId;
}

module.exports = { checkShop, resolveShop, requireShop };
