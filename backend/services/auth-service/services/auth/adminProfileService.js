// Admin profile logic. These rows are the login users of an account: its Owner (created at signup activation) and the
// Admins the owner adds here. SECURITY NOTES:
//   * Passwords are hashed with @pos-cafe/shared/password (salted scrypt) before they reach a repository.
//   * toDto lists every output field explicitly, so no password or hash can ever be returned by accident.
//   * Every function takes the signed-in user (`auth`) and only sees users of that user's own account (another
//     account's user answers 404). Role, status and verification times are set HERE, never taken from a request.
//   * Owners may edit or reset the password of anyone in the account; an Admin may only touch their own profile (403).
const {
  adminProfileRepository, sessionRepository,
} = require('../../repositories');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('../../config/constants/messages');
const clock = require('@pos-cafe/shared/clock');
const { normalizePhone } = require('@pos-cafe/shared/validator');
const { hashPassword } = require('@pos-cafe/shared/password');
const imageService = require('../storage/imageService');

const notFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.ADMIN_NOT_FOUND);
const forbidden = () => new AppError(403, ERROR_CODES.FORBIDDEN, MESSAGES.FORBIDDEN);
const emailTaken = () => new AppError(409, ERROR_CODES.DUPLICATE, MESSAGES.ADMIN_EMAIL_TAKEN, [{ field: 'email', message: 'Already in use' }]);

function toDto(row) {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    phone: row.phone,
    email: row.email,
    role: row.role === 'owner' ? 'Owner' : 'Admin', // the Figma's "Admin" badge; the account's first user is its Owner
    image: imageService.adminImageUrl(row.imagePath),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const list = async (auth) => (await adminProfileRepository.listByAccount(auth.accountId)).map(toDto);

async function owned(auth, id) {
  const row = await adminProfileRepository.findById(id);
  if (!row || row.accountId !== auth.accountId) throw notFound();
  return row;
}

// Yourself, or anyone in the account if you are the owner.
async function ownedAndAllowed(auth, id) {
  const row = await owned(auth, id);
  if (row.id !== auth.userId && auth.role !== 'owner') throw forbidden();
  return row;
}

async function get(auth, id) {
  return toDto(await owned(auth, id));
}

// Owner only (enforced on the route). The new person is always an 'admin' of the caller's account, active, with no
// verification times. PENDING: email verification for admins added this way is not designed.
async function create(auth, { password, ...profile }) {
  if (await adminProfileRepository.findByEmail(profile.email)) throw emailTaken();
  const passwordHash = await hashPassword(password);
  return toDto(await adminProfileRepository.create({
    ...profile,
    phoneNormalized: normalizePhone(profile.phone),
    passwordHash,
    accountId: auth.accountId,
    role: 'admin',
    status: 'active',
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
  }));
}

async function update(auth, id, profile) {
  await ownedAndAllowed(auth, id);
  const sameEmail = await adminProfileRepository.findByEmail(profile.email);
  if (sameEmail && sameEmail.id !== id) throw emailTaken();
  return toDto(await adminProfileRepository.update(id, { ...profile, phoneNormalized: normalizePhone(profile.phone) }));
}

// Replaces the password and signs the person out everywhere. When you change your own password your current session
// stays signed in; when an owner resets someone else's, all of that person's sessions end.
async function changePassword(auth, id, password) {
  await ownedAndAllowed(auth, id);
  await adminProfileRepository.setPasswordHash(id, await hashPassword(password));
  await sessionRepository.revokeAllForUser(id, clock.now(), id === auth.userId ? auth.sessionId : null);
}

async function setImage(auth, id, buffer, type) {
  await ownedAndAllowed(auth, id);
  const filename = await imageService.saveAdminImage(buffer, type);
  const previous = await adminProfileRepository.setImagePath(id, filename);
  if (previous === undefined) {
    await imageService.removeAdminImage(filename);
    throw notFound();
  }
  await imageService.removeAdminImage(previous);
  return get(auth, id);
}

module.exports = { list, get, create, update, changePassword, setImage };
