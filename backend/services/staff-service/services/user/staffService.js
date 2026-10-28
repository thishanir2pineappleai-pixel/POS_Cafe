// Staff Management: staff list, summary, create, edit, status, removal, picture and documents.
//
// SECURITY AND SCOPE
//   * Everything belongs to one shop of the caller's account. A staff member of another account answers 404 exactly like a
//     missing one. shopId, accountId, code, permissions, imagePath and the password hash are NEVER taken from a request.
//   * The employee code (STF0001, STF0002, ...) is generated here, per shop. Email, phone, NIC and the code are unique within
//     a shop, the username within the account (removed staff keep their values reserved, see staffRepository).
//   * Employment Records (salary, EPF/ETF, documents) are for the OWNER only: an admin neither sees nor changes them.
//   * A staff member can only be given a role whose permissions the caller holds (roleService.assertCanAssign).
//   * toDto lists every output field explicitly: no password hash, stored file name or internal path can leak.
//   * Staff passwords are hashed (salted scrypt). Staff cannot sign in yet: PENDING APPROVAL, the hash is only stored.
// REMOVAL: the Figma says "deleted permanently", but payroll, attendance and leave records point at staff, so DELETE only
// marks the record removed (restorable by the owner). PENDING APPROVAL: confirm whether a real purge is wanted.
const {
  staffRepository, staffRoleRepository, shiftRepository,
} = require('../../repositories');
const { DuplicateError } = require('../../repositories/memory/scoped');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('../../config/constants/messages');
const clock = require('@pos-cafe/shared/clock');
const { buildMeta } = require('@pos-cafe/shared/pagination');
const { hashPassword } = require('@pos-cafe/shared/password');
const documentService = require('../storage/documentService');
const imageService = require('../storage/imageService');
const uploadService = require('../storage/uploadService');
const roleService = require('./roleService');
const shiftService = require('./shiftService');
const { requireShop, resolveShop } = require('./shopScope');

const isOwner = (auth) => auth.role === 'owner';
const notFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.STAFF_NOT_FOUND);
const sensitiveForbidden = () => new AppError(403, ERROR_CODES.FORBIDDEN, MESSAGES.SENSITIVE_FORBIDDEN);
const invalid = (field, message) => new AppError(400, ERROR_CODES.VALIDATION_ERROR, MESSAGES.VALIDATION_FAILED, [{ field, message }]);
const imageUrl = (row) => (row.imagePath ? `/api/v1/staff/${row.id}/image` : null);

// ---- output shapes ----
async function lookups(shopId) {
  const by = async (list) => new Map((await list).map((r) => [r.id, r]));
  return {
    roles: await by(staffRoleRepository.roles.list(shopId)),
    teams: await by(staffRoleRepository.teams.list(shopId)),
    shifts: await by(shiftRepository.list(shopId)),
  };
}
const brief = (map, id) => (map.get(id) ? { id, name: map.get(id).name } : null);

// The short staff reference used by attendance, leave and payroll rows.
const briefStaff = (row, lk) => ({ id: row.id, code: row.code, name: row.name, image: imageUrl(row), role: brief(lk.roles, row.roleId) });

const listItem = (row, lk) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  image: imageUrl(row),
  role: brief(lk.roles, row.roleId),
  team: brief(lk.teams, row.teamId),
  shift: brief(lk.shifts, row.shiftId),
  phone: row.phone,
  email: row.email,
  lastLogin: null, // staff cannot sign in yet
  status: row.active ? 'Active' : 'Inactive',
  active: row.active,
});

const documentInfo = (doc) => (doc ? { fileName: doc.fileName, type: doc.type, size: doc.size, uploadedAt: doc.uploadedAt } : null);

function toDto(row, lk, auth) {
  const dto = {
    ...listItem(row, lk),
    gender: row.gender,
    nic: row.nic,
    dob: row.dob,
    address: row.address,
    emergencyContact: row.emergencyContact,
    employment: {
      joinDate: row.joinDate, employmentType: row.employmentType, inactiveReason: row.inactiveReason,
      workingDays: row.workingDays, hoursPerWeek: row.hoursPerWeek, username: row.username,
    },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (isOwner(auth)) { // Employment Records
    dto.salary = row.salary;
    dto.epf = row.epf;
    dto.documents = { cv: documentInfo(row.documents.cv), idCopy: documentInfo(row.documents.idCopy), agreement: documentInfo(row.documents.agreement) };
  }
  return dto;
}

// ---- helpers ----
async function owned(auth, id, options) {
  const row = await staffRepository.findById(auth.accountId, id, options);
  if (!row) throw notFound();
  return row;
}

function duplicateError(field) {
  const names = { email: 'email', phone: 'phone number', nic: 'NIC', username: 'username' };
  return new AppError(409, ERROR_CODES.DUPLICATE, MESSAGES.STAFF_DUPLICATE, [{ field, message: `Another staff member already has this ${names[field] ?? field}` }]);
}
const mapDuplicate = (err) => { throw err instanceof DuplicateError ? duplicateError(err.duplicateField) : err; };

// A role/team of THIS shop (400 with the field name otherwise).
async function ownRole(auth, shopId, id) {
  const row = await staffRoleRepository.roles.find(auth.accountId, id);
  if (!row || row.shopId !== shopId) throw invalid('roleId', 'Unknown role');
  return row;
}
async function ownTeam(auth, shopId, id) {
  const row = await staffRoleRepository.teams.find(auth.accountId, id);
  if (!row || row.shopId !== shopId) throw invalid('teamId', 'Unknown team');
  return row;
}

// ---- list and summary ----
function matches(row, q) {
  const needle = q.toLowerCase().replace(/^#/, '');
  const code = /^stf0*(\d+)$/.exec(needle);
  const digits = q.replace(/\D/g, '');
  const phoneLike = /^[+\d\s-]+$/.test(q);
  return row.name.toLowerCase().includes(needle) || row.email.includes(needle) || row.code.toLowerCase().includes(needle)
    || (code !== null && row.codeNumber === Number(code[1]))
    || (phoneLike && digits.length >= 3 && row.phoneNormalized.replace(/\D/g, '').includes(digits)); // only for text that looks like a phone number
}

async function list(auth, query) {
  const shop = await resolveShop(auth, query.shopId);
  if (shop === null) return { items: [], meta: buildMeta(0, query.page, query.limit) };
  const rows = (await staffRepository.list(shop)).filter((s) => (
    (query.roleId === undefined || s.roleId === query.roleId)
    && (query.teamId === undefined || s.teamId === query.teamId)
    && (query.shiftId === undefined || s.shiftId === query.shiftId)
    && (query.status === undefined || s.active === (query.status === 'active'))
    && (query.q === undefined || matches(s, query.q))
  ));
  const lk = await lookups(shop);
  const items = rows.slice((query.page - 1) * query.limit, query.page * query.limit).map((r) => listItem(r, lk));
  return { items, meta: buildMeta(rows.length, query.page, query.limit) };
}

// The five Figma cards, all calculated from stored data.
async function summary(auth, { shopId }) {
  const shop = await resolveShop(auth, shopId);
  const empty = { totalStaff: 0, activeStaff: 0, inactiveStaff: 0, staffOnDuty: 0, activeShift: null };
  if (shop === null) return empty;
  const rows = await staffRepository.list(shop);
  const active = rows.filter((s) => s.active).length;
  const now = clock.now();
  const shift = await shiftService.currentShift(shop, now);
  return {
    totalStaff: rows.length,
    activeStaff: active,
    inactiveStaff: rows.length - active,
    staffOnDuty: await shiftService.onDutyCount(shop, shift, now),
    activeShift: shift && { id: shift.id, name: shift.name, startTime: shift.startTime, endTime: shift.endTime },
  };
}

async function get(auth, id) {
  const row = await owned(auth, id);
  return toDto(row, await lookups(row.shopId), auth);
}

// ---- create and edit ----
async function create(auth, shopId, v) {
  if ((v.salary || v.epf) && !isOwner(auth)) throw sensitiveForbidden();
  const shop = await requireShop(auth, shopId);
  const role = await ownRole(auth, shop, v.roleId);
  await ownTeam(auth, shop, v.teamId);
  await shiftService.assignable(auth.accountId, shop, v.shiftId);
  roleService.assertCanAssign(auth, role);

  const { password, ...rest } = v;
  const row = await staffRepository.create({
    ...rest,
    accountId: auth.accountId,
    shopId: shop,
    imagePath: null,
    inactiveReason: v.active ? null : v.inactiveReason,
    passwordHash: await hashPassword(password),
    salary: v.salary ?? null,
    epf: v.epf ?? null,
    documents: { cv: null, idCopy: null, agreement: null },
  }, shiftService.rosterFromWorkingDays(v.shiftId, v.workingDays)).catch(mapDuplicate);
  return toDto(row, await lookups(shop), auth);
}

async function update(auth, id, v) {
  if ((v.salary || v.epf) && !isOwner(auth)) throw sensitiveForbidden();
  const row = await owned(auth, id);
  if (v.roleId !== undefined && v.roleId !== row.roleId) roleService.assertCanAssign(auth, await ownRole(auth, row.shopId, v.roleId));
  else if (v.roleId !== undefined) await ownRole(auth, row.shopId, v.roleId);
  if (v.teamId !== undefined) await ownTeam(auth, row.shopId, v.teamId);
  if (v.shiftId !== undefined && v.shiftId !== row.shiftId) await shiftService.assignable(auth.accountId, row.shopId, v.shiftId);

  // The roster follows the staff member's shift and working days whenever either one changes.
  const merged = { ...row, ...v };
  const roster = v.shiftId !== undefined || v.workingDays !== undefined ? shiftService.rosterFromWorkingDays(merged.shiftId, merged.workingDays) : undefined;
  const saved = await staffRepository.update(row.id, v, roster).catch(mapDuplicate);
  return toDto(saved, await lookups(row.shopId), auth);
}

// Active / Inactive with the reason the Figma asks for. Removed staff cannot be changed.
async function setStatus(auth, id, { active, inactiveReason }) {
  const row = await owned(auth, id);
  const saved = await staffRepository.update(row.id, { active, inactiveReason: active ? null : inactiveReason });
  return toDto(saved, await lookups(row.shopId), auth);
}

async function remove(auth, id) {
  const row = await owned(auth, id);
  await staffRepository.setRemoved(row.id, new Date(clock.now()).toISOString());
}

async function restore(auth, id) {
  const row = await owned(auth, id, { withRemoved: true });
  const saved = await staffRepository.setRemoved(row.id, null);
  return toDto(saved, await lookups(row.shopId), auth);
}

// ---- picture ----
async function setImage(auth, id, buffer, type) {
  const row = await owned(auth, id);
  const filename = await imageService.saveStaffImage(buffer, type);
  const previous = await staffRepository.setImagePath(row.id, filename);
  await uploadService.removeStaffImage(previous);
  return { image: `/api/v1/staff/${row.id}/image` };
}

async function readImage(auth, id) {
  const row = await owned(auth, id);
  const buffer = await uploadService.readStaffImage(row.imagePath);
  if (!buffer) throw new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.DOCUMENT_NOT_FOUND);
  return { buffer, mime: row.imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg' };
}

// ---- documents (owner only) ----
async function setDocument(auth, id, slot, file) {
  if (!isOwner(auth)) throw sensitiveForbidden();
  const row = await owned(auth, id);
  const type = documentService.detectDocumentType(file.buffer);
  if (!documentService.isAllowed(slot, type)) throw new AppError(415, ERROR_CODES.UNSUPPORTED_IMAGE, MESSAGES.DOCUMENT_UNSUPPORTED);
  const doc = await documentService.saveDocument(file.buffer, type, file.originalname);
  const previous = await staffRepository.setDocument(row.id, slot, doc);
  if (previous) await uploadService.removeStaffDocument(previous.storedName);
  return documentInfo(doc);
}

async function readDocument(auth, id, slot) {
  if (!isOwner(auth)) throw sensitiveForbidden();
  const row = await owned(auth, id);
  const doc = row.documents[slot];
  const buffer = doc && await uploadService.readStaffDocument(doc.storedName);
  if (!buffer) throw new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.DOCUMENT_NOT_FOUND);
  return { buffer, mime: documentService.MIME[doc.type], fileName: doc.fileName };
}

module.exports = {
  list, summary, get, create, update, setStatus, remove, restore, setImage, readImage, setDocument, readDocument,
  lookups, briefStaff, owned, isOwner,
};
