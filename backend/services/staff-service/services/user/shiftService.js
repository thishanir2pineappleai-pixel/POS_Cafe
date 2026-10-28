// Shifts and the weekly roster (Shift tab).
//   * A shift is a named time range of one shop (the Figma: Morning 06:00-14:00, Evening 14:00-22:00, Night 22:00-06:00).
//     Nothing is seeded: the owner or an admin creates them. Shifts can be turned off ("no longer available for use").
//   * The roster holds ONE entry per staff member and weekday: a shift or 'off'. Assigning replaces whatever was there, so
//     a person cannot hold two shifts on one day. Different shifts whose TIMES overlap are allowed: the Figma defines no
//     rule for that (PENDING APPROVAL).
//   * PENDING APPROVAL: "now" is the server's local time; the shop's own time zone is not used yet (shops start without one).
const { shiftRepository, staffRepository } = require('../../repositories');
const { DuplicateError } = require('../../repositories/memory/scoped');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('../../config/constants/messages');
const { WEEKDAYS } = require('../../config/constants/staff');
const { buildMeta } = require('@pos-cafe/shared/pagination');
const { addDays, localDate, localMinutes, minutesOf, shiftCovers, weekdayOf } = require('@pos-cafe/shared/date');
const csvService = require('@pos-cafe/shared/csv');
const { requireShop, resolveShop } = require('./shopScope');

const notFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.SHIFT_NOT_FOUND);
const taken = () => new AppError(409, ERROR_CODES.DUPLICATE, MESSAGES.NAME_TAKEN, [{ field: 'name', message: 'Already used' }]);
const dto = (row, staffCount) => ({
  id: row.id, name: row.name, startTime: row.startTime, endTime: row.endTime, active: row.active, staffCount, createdAt: row.createdAt, updatedAt: row.updatedAt,
});

async function owned(auth, id) {
  const row = await shiftRepository.find(auth.accountId, id);
  if (!row) throw notFound();
  return row;
}

// How many active staff have each shift as their shift.
async function staffCounts(shopId) {
  const map = new Map();
  for (const s of await staffRepository.list(shopId)) if (s.active) map.set(s.shiftId, (map.get(s.shiftId) || 0) + 1);
  return map;
}

async function list(auth, { shopId }) {
  const shop = await resolveShop(auth, shopId);
  if (shop === null) return [];
  const counts = await staffCounts(shop);
  return (await shiftRepository.list(shop)).map((s) => dto(s, counts.get(s.id) || 0));
}

async function create(auth, shopId, value) {
  const shop = await requireShop(auth, shopId);
  const row = await shiftRepository.create({ ...value, accountId: auth.accountId, shopId: shop }).catch((e) => { throw e instanceof DuplicateError ? taken() : e; });
  return dto(row, 0);
}

async function update(auth, id, value) {
  const row = await owned(auth, id);
  const saved = await shiftRepository.update(row.id, value).catch((e) => { throw e instanceof DuplicateError ? taken() : e; });
  return dto(saved, (await staffCounts(row.shopId)).get(row.id) || 0);
}

// Turning a shift off keeps the people already on it; it only stops NEW assignments (PENDING APPROVAL).
async function setStatus(auth, id, { active }) {
  const row = await owned(auth, id);
  const saved = await shiftRepository.update(row.id, { active });
  return dto(saved, (await staffCounts(row.shopId)).get(row.id) || 0);
}

async function remove(auth, id) {
  const row = await owned(auth, id);
  if (await staffRepository.countUsing(row.shopId, 'shiftId', row.id) > 0 || await shiftRepository.isRostered(row.shopId, row.id)) {
    throw new AppError(409, ERROR_CODES.CONFLICT, MESSAGES.IN_USE);
  }
  await shiftRepository.remove(row.id);
}

// An ACTIVE shift of this shop that can be assigned (400 with the field name otherwise).
async function assignable(accountId, shopId, shiftId) {
  const row = await shiftRepository.find(accountId, shiftId);
  if (!row || row.shopId !== shopId) throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, MESSAGES.VALIDATION_FAILED, [{ field: 'shiftId', message: 'Unknown shift' }]);
  if (!row.active) throw new AppError(409, ERROR_CODES.CONFLICT, MESSAGES.SHIFT_INACTIVE, [{ field: 'shiftId', message: 'Shift is turned off' }]);
  return row;
}

// Working days -> roster: those days get the shift, every other day is 'off' (the Add Staff "Shift Assignment" section).
const rosterFromWorkingDays = (shiftId, workingDays) => Object.fromEntries(WEEKDAYS.map((d) => [d, workingDays.includes(d) ? shiftId : 'off']));

// The active shift whose time range contains `ms` (the lowest id when ranges overlap), or null.
async function currentShift(shopId, ms) {
  const minutes = localMinutes(ms);
  return (await shiftRepository.list(shopId)).find((s) => s.active && shiftCovers(s.startTime, s.endTime, minutes)) ?? null;
}

// Active staff rostered on `shift` today. A shift that runs past midnight belongs, after midnight, to the day it started.
async function onDutyCount(shopId, shift, ms) {
  if (!shift) return 0;
  const overnight = minutesOf(shift.startTime) > minutesOf(shift.endTime);
  const today = localDate(ms);
  const day = weekdayOf(overnight && localMinutes(ms) < minutesOf(shift.endTime) ? addDays(today, -1) : today);
  let count = 0;
  for (const s of await staffRepository.list(shopId)) {
    if (s.active && (await shiftRepository.getRoster(s.id))[day] === shift.id) count += 1;
  }
  return count;
}

// ---- roster ----
async function cell(shiftsById, value) {
  if (value === undefined) return null;
  if (value === 'off') return { type: 'off' };
  const s = shiftsById.get(value);
  return s ? { type: 'shift', shiftId: s.id, name: s.name, startTime: s.startTime, endTime: s.endTime } : null;
}

async function buildRow(staff, shiftsById, days) {
  const cells = {};
  for (const d of WEEKDAYS) cells[d] = await cell(shiftsById, days[d]);
  return { staff: { id: staff.id, code: staff.code, name: staff.name, image: staff.imagePath ? `/api/v1/staff/${staff.id}/image` : null }, days: cells };
}

async function buildRow(staff, shiftsById, days) {
  const cells = {};
  for (const d of WEEKDAYS) cells[d] = await cell(shiftsById, days[d]);
  return { staff: { id: staff.id, code: staff.code, name: staff.name, image: staff.imagePath ? `/api/v1/staff/${staff.id}/image` : null }, days: cells };
}

async function rosterRows(shop, query) {
  const shiftsById = new Map((await shiftRepository.list(shop)).map((s) => [s.id, s]));
  const needle = query.q?.toLowerCase();
  const rows = [];
  for (const s of (await staffRepository.list(shop)).filter((x) => x.active).sort((a, b) => a.id - b.id)) {
    if (needle && !s.name.toLowerCase().includes(needle) && !s.code.toLowerCase().includes(needle.replace(/^#/, ''))) continue;
    const days = await shiftRepository.getRoster(s.id);
    const wanted = (value) => (query.shift === undefined ? value !== undefined : (query.shift === 'off' ? value === 'off' : value === query.shift));
    const scope = query.day ? [query.day] : WEEKDAYS;
    if ((query.shift !== undefined || query.day) && !scope.some((d) => wanted(days[d]))) continue;
    rows.push(await buildRow(s, shiftsById, days));
  }
  return rows;
}

async function roster(auth, query) {
  const shop = await resolveShop(auth, query.shopId);
  if (shop === null) return { items: [], meta: buildMeta(0, query.page, query.limit) };
  const rows = await rosterRows(shop, query);
  return { items: rows.slice((query.page - 1) * query.limit, query.page * query.limit), meta: buildMeta(rows.length, query.page, query.limit) };
}

async function exportRoster(auth, query) {
  const shop = await resolveShop(auth, query.shopId);
  const rows = shop === null ? [] : await rosterRows(shop, query);
  const label = (c) => (c === null ? '' : c.type === 'off' ? 'OFF' : c.name);
  return csvService.toCsv(['Staff ID', 'Staff', ...WEEKDAYS.map((d) => d.toUpperCase())], rows.map((r) => [r.staff.code, r.staff.name, ...WEEKDAYS.map((d) => label(r.days[d]))]));
}

async function ownedStaff(auth, staffId) {
  const s = await staffRepository.findById(auth.accountId, staffId);
  if (!s) throw new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.STAFF_NOT_FOUND);
  return s;
}

// Sets one day, the whole week, or the whole week except days that are off, to a shift or to 'off'.
async function assign(auth, staffId, { shiftId, off, applyTo, day }) {
  const staff = await ownedStaff(auth, staffId);
  const value = off ? 'off' : (await assignable(auth.accountId, staff.shopId, shiftId)).id;
  const days = await shiftRepository.getRoster(staff.id);
  const targets = applyTo === 'day' ? [day] : applyTo === 'week' ? WEEKDAYS : WEEKDAYS.filter((d) => days[d] !== 'off');
  for (const d of targets) days[d] = value;
  await shiftRepository.setRoster(staff.id, days);
  return buildRow(staff, new Map((await shiftRepository.list(staff.shopId)).map((x) => [x.id, x])), days);
}

// Removes the assignment of one day, or of the whole week (the row's trash button).
async function clear(auth, staffId, { day }) {
  const staff = await ownedStaff(auth, staffId);
  if (!day) await shiftRepository.clearRoster(staff.id);
  else {
    const days = await shiftRepository.getRoster(staff.id);
    delete days[day];
    await shiftRepository.setRoster(staff.id, days);
  }
}

module.exports = {
  list, create, update, setStatus, remove, assignable, rosterFromWorkingDays, currentShift, onDutyCount, roster, exportRoster, assign, clear,
};
