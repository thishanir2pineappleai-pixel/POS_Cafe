// Shop profile (Business Profile) logic. Talks only to the repository (in-memory for now, MySQL later).
// Every function takes the signed-in user (`auth`) and only ever sees shops of that user's own account: a shop of another
// account answers 404, exactly like a shop that does not exist.
const { businessProfileRepository } = require('../../repositories');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('../../config/constants/messages');
const imageService = require('../storage/imageService');

const notFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.SHOP_NOT_FOUND);

function toDto(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    email: row.email,
    website: row.website,
    timezone: row.timezone,
    image: imageService.settingsImageUrl(row.imagePath),
    status: 'Active', // the Figma shows an "Active" badge but no way to change it; no status rules exist yet
    createdAt: row.createdAt,
    updatedAt: row.updatedAt, // the "Updated on ..." date on the card
  };
}

const list = async (auth) => (await businessProfileRepository.listByAccount(auth.accountId)).map(toDto);

// The shop, but only if it belongs to the caller's account.
async function owned(auth, id) {
  const row = await businessProfileRepository.findById(id);
  if (!row || row.accountId !== auth.accountId) throw notFound();
  return row;
}

async function get(auth, id) {
  return toDto(await owned(auth, id));
}

// The account and owner are set here from the signed-in user, never from the request body.
const create = async (auth, value) => toDto(await businessProfileRepository.create({ ...value, accountId: auth.accountId, ownerId: auth.userId }));

// Replaces all text fields (an absent email or website becomes empty); the logo is changed only by the image endpoint.
async function update(auth, id, value) {
  await owned(auth, id);
  return toDto(await businessProfileRepository.update(id, value));
}

// The file is saved only after the profile is known to exist and to be the caller's; the replaced file is deleted afterwards.
async function setImage(auth, id, buffer, type) {
  await owned(auth, id);
  const filename = await imageService.saveSettingsImage(buffer, type);
  const previous = await businessProfileRepository.setImagePath(id, filename);
  if (previous === undefined) {
    await imageService.removeSettingsImage(filename);
    throw notFound();
  }
  await imageService.removeSettingsImage(previous);
  return get(auth, id);
}

// ---- Used by other services (through /internal, never by the browser) ----

// Shops of an account as { id, name, timezone }: what the Auth Service (GET /auth/me) and the services that scope data to a
// shop need. No other profile data leaves this service.
async function summariesForAccount(accountId) {
  return (await businessProfileRepository.listByAccount(accountId)).map(({ id, name, timezone }) => ({ id, name, timezone }));
}

// Signup activation creates the account's first shop. Idempotent: if the account already has a shop (a retry after a lost
// answer) the oldest one is returned instead of a second one being created.
async function ensureFirstShop(accountId, { ownerId, ...value }) {
  const shops = await businessProfileRepository.listByAccount(accountId); // newest first
  const row = shops.length > 0 ? shops[shops.length - 1] : await businessProfileRepository.create({ ...value, accountId, ownerId });
  return { id: row.id, name: row.name, timezone: row.timezone };
}

module.exports = {
  list, get, create, update, setImage, summariesForAccount, ensureFirstShop,
};
