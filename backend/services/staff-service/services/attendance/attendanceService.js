// Attendance and leave (Attendance tab, Leave Management).
//
// WORKFLOW (the Figma shows the results, not who records them, so this is PENDING APPROVAL):
//   * A signed-in owner/admin records "check in" and "check out" for a staff member. The time is ALWAYS the server clock.
//   * One attendance row per staff member per calendar day: a second check-in the same day is 409, so is a check-out
//     without a check-in or a second check-out.
//   * Status of a day, in this order: a leave record that day (Hour Permission / Half Day Leave / Full Day Leave), else a
//     check-in (Late when after the start of the shift rostered for that weekday + LATE_GRACE_MINUTES, otherwise On Time),
//     else Absent when a shift was rostered and has already started, else the staff member is not listed.
//   * Overnight shifts are not handled: the attendance date is the calendar date of the check-in.
//   * One leave per staff member per date (a leave plus a check-in the same day is allowed, e.g. a half day).
//   * Not built, rule missing: the "Annual Leave Balance 12 / 26 days" (no yearly allowance is defined), the leave durations of
//     the half days (their hours are not defined), and PDF/XLS export (CSV only).
const { attendanceRepository, shiftRepository, staffRepository } = require('../../repositories');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('../../config/constants/messages');
const { ATTENDANCE_STATUS, LATE_GRACE_MINUTES, LEAVE_TYPES } = require('../../config/constants/staff');
const clock = require('@pos-cafe/shared/clock');
const { localDate, localDateTime, localMinutes, minutesOf, weekdayOf } = require('@pos-cafe/shared/date');
const { buildMeta } = require('@pos-cafe/shared/pagination');
const csvService = require('@pos-cafe/shared/csv');
const staffService = require('../user/staffService');
const { resolveShop } = require('../user/shopScope');

const { attendance, leaves } = attendanceRepository;
const conflict = (message) => new AppError(409, ERROR_CODES.CONFLICT, message);
const hhmm = (iso) => (iso ? iso.slice(11, 16) : null);

const leaveStatus = (leave) => (leave.type === 'hour_permission' ? ATTENDANCE_STATUS.HOUR_PERMISSION : leave.type === 'half_day' ? ATTENDANCE_STATUS.HALF_DAY : ATTENDANCE_STATUS.FULL_DAY);

// The shift rostered for this staff member on this date (a shift row), or null.
async function scheduledShift(staff, date, shiftsById) {
  const entry = (await shiftRepository.getRoster(staff.id))[weekdayOf(date)];
  return typeof entry === 'number' ? shiftsById.get(entry) ?? null : null;
}

function statusOf({ record, leave, shift }) {
  if (leave) return leaveStatus(leave);
  if (record) return shift && localMinutes(Date.parse(record.checkInAt)) > minutesOf(shift.startTime) + LATE_GRACE_MINUTES ? ATTENDANCE_STATUS.LATE : ATTENDANCE_STATUS.ON_TIME;
  return ATTENDANCE_STATUS.ABSENT;
}

// Every row of one day: staff with a record or a leave, plus the staff who were rostered and did not show up.
async function dayRows(shopId, date) {
  const now = clock.now();
  const today = localDate(now);
  const lk = await staffService.lookups(shopId);
  const records = new Map((await attendance.listByDate(shopId, date)).map((r) => [r.staffId, r]));
  const dayLeaves = new Map((await leaves.listOn(shopId, date)).map((l) => [l.staffId, l]));
  const rows = [];
  let activeStaff = 0;
  for (const staff of (await staffRepository.list(shopId)).filter((s) => s.active && s.joinDate <= date).sort((a, b) => a.id - b.id)) {
    activeStaff += 1;
    const record = records.get(staff.id) ?? null;
    const leave = dayLeaves.get(staff.id) ?? null;
    const shift = await scheduledShift(staff, date, lk.shifts);
    const started = shift && (date < today || (date === today && localMinutes(now) >= minutesOf(shift.startTime)));
    if (!record && !leave && !started) continue;
    rows.push({
      staff: staffService.briefStaff(staff, lk),
      date,
      checkIn: hhmm(record?.checkInAt),
      checkOut: hhmm(record?.checkOutAt),
      status: statusOf({ record, leave, shift }),
      leaveType: leave ? leave.type : null,
      shift: shift ? { id: shift.id, name: shift.name } : null,
      _hasRecord: Boolean(record),
    });
  }
  return { rows, activeStaff };
}

const publicRow = ({ _hasRecord, ...row }) => row; // eslint-disable-line no-unused-vars

async function summary(auth, { date, shopId }) {
  const shop = await resolveShop(auth, shopId);
  const zero = { date, totalStaff: 0, present: 0, late: 0, absent: 0, leave: 0 };
  if (shop === null) return zero;
  const { rows, activeStaff } = await dayRows(shop, date);
  return {
    date,
    totalStaff: activeStaff,
    present: rows.filter((r) => r._hasRecord).length,
    late: rows.filter((r) => r.status === ATTENDANCE_STATUS.LATE).length,
    absent: rows.filter((r) => r.status === ATTENDANCE_STATUS.ABSENT).length,
    leave: rows.filter((r) => r.leaveType !== null).length,
  };
}

async function filteredRows(auth, query) {
  const shop = await resolveShop(auth, query.shopId);
  if (shop === null) return [];
  const needle = query.q?.toLowerCase().replace(/^#/, '');
  return (await dayRows(shop, query.date)).rows.filter((r) => (
    (query.roleId === undefined || r.staff.role?.id === query.roleId)
    && (query.staffId === undefined || r.staff.id === query.staffId)
    && (query.status === undefined || r.status === query.status)
    && (needle === undefined || r.staff.name.toLowerCase().includes(needle) || r.staff.code.toLowerCase().includes(needle))
  )).map(publicRow);
}

async function list(auth, query) {
  const rows = await filteredRows(auth, query);
  return { items: rows.slice((query.page - 1) * query.limit, query.page * query.limit), meta: buildMeta(rows.length, query.page, query.limit) };
}

async function exportCsv(auth, query) {
  const rows = await filteredRows(auth, query);
  return csvService.toCsv(['Staff ID', 'Staff', 'Role', 'Date', 'Check In', 'Check Out', 'Status'],
    rows.map((r) => [r.staff.code, r.staff.name, r.staff.role?.name ?? '', r.date, r.checkIn ?? '', r.checkOut ?? '', r.status]));
}

// ---- check in / out ----
async function activeStaff(auth, staffId) {
  const staff = await staffService.owned(auth, staffId);
  if (!staff.active) throw conflict(MESSAGES.STAFF_INACTIVE);
  return staff;
}

async function checkIn(auth, { staffId }) {
  const staff = await activeStaff(auth, staffId);
  const now = clock.now();
  const date = localDate(now);
  if (await attendance.findByStaffDate(staff.shopId, staff.id, date)) throw conflict(MESSAGES.ALREADY_CHECKED_IN);
  await attendance.create({ accountId: auth.accountId, shopId: staff.shopId, staffId: staff.id, date, checkInAt: localDateTime(now), checkOutAt: null });
  return detail(auth, staff.id, { date });
}

async function checkOut(auth, { staffId }) {
  const staff = await activeStaff(auth, staffId);
  const now = clock.now();
  const record = await attendance.findByStaffDate(staff.shopId, staff.id, localDate(now));
  if (!record) throw conflict(MESSAGES.NOT_CHECKED_IN);
  if (record.checkOutAt) throw conflict(MESSAGES.ALREADY_CHECKED_OUT);
  await attendance.update(record.id, { checkOutAt: localDateTime(now) });
  return detail(auth, staff.id, { date: record.date });
}

// "View Leave / Attendance Details": the day's status and timeline (check in, permission start/return, half-day leave, check out).
async function detail(auth, staffId, { date }) {
  const staff = await staffService.owned(auth, staffId);
  const lk = await staffService.lookups(staff.shopId);
  const record = await attendance.findByStaffDate(staff.shopId, staff.id, date);
  const leave = await leaves.findByStaffDate(staff.shopId, staff.id, date);
  const shift = await scheduledShift(staff, date, lk.shifts);
  if (!record && !leave) throw new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.ATTENDANCE_NOT_FOUND);

  const timeline = [];
  if (record) timeline.push({ type: 'check_in', time: hhmm(record.checkInAt) });
  if (leave?.type === 'hour_permission') {
    timeline.push({ type: 'hour_permission', time: leave.startTime }, { type: 'returned', time: leave.endTime });
  }
  if (leave?.type === 'half_day') timeline.push({ type: 'half_day_leave', time: null, half: leave.half });
  if (record?.checkOutAt) timeline.push({ type: 'check_out', time: hhmm(record.checkOutAt) });
  return {
    staff: staffService.briefStaff(staff, lk),
    date,
    status: statusOf({ record, leave, shift }),
    checkIn: hhmm(record?.checkInAt),
    checkOut: hhmm(record?.checkOutAt),
    leave: leave ? leaveDto(leave, staff, lk) : null,
    timeline,
  };
}

// ---- leave management ----
function leaveDto(row, staff, lk) {
  let durationHours = null;
  if (row.type === 'hour_permission') durationHours = Number(((minutesOf(row.endTime) - minutesOf(row.startTime)) / 60).toFixed(2));
  return {
    id: row.id,
    staff: staffService.briefStaff(staff, lk),
    date: row.date,
    type: row.type,
    typeLabel: LEAVE_TYPES[row.type],
    startTime: row.startTime,
    endTime: row.endTime,
    half: row.half,
    durationHours, // hour permission only: the half-day hours are not defined
    reason: row.reason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function leaveRows(shopId, auth) {
  const lk = await staffService.lookups(shopId);
  const staffById = new Map((await staffRepository.list(shopId)).map((s) => [s.id, s]));
  return (await leaves.list(shopId)).filter((l) => staffById.has(l.staffId)).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .map((l) => leaveDto(l, staffById.get(l.staffId), lk));
}

async function leaveList(auth, query) {
  const shop = await resolveShop(auth, query.shopId);
  if (shop === null) return { items: [], meta: buildMeta(0, query.page, query.limit) };
  const needle = query.q?.toLowerCase().replace(/^#/, '');
  const rows = (await leaveRows(shop, auth)).filter((l) => (
    (query.type === undefined || l.type === query.type)
    && (query.staffId === undefined || l.staff.id === query.staffId)
    && (query.date === undefined || l.date === query.date)
    && (needle === undefined || l.staff.name.toLowerCase().includes(needle) || l.staff.code.toLowerCase().includes(needle))
  ));
  return { items: rows.slice((query.page - 1) * query.limit, query.page * query.limit), meta: buildMeta(rows.length, query.page, query.limit) };
}

// The four cards of the Leave Management page.
async function leaveSummary(auth, { shopId }) {
  const shop = await resolveShop(auth, shopId);
  const rows = shop === null ? [] : await leaveRows(shop, auth);
  const count = (type) => rows.filter((l) => l.type === type).length;
  return { totalLeave: rows.length, hourPermission: count('hour_permission'), halfDay: count('half_day'), fullDay: count('full_day') };
}

async function leaveGet(auth, id) {
  const row = await leaves.find(auth.accountId, id);
  const staff = row && await staffRepository.findById(auth.accountId, row.staffId);
  if (!row || !staff) throw new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.LEAVE_NOT_FOUND);
  return leaveDto(row, staff, await staffService.lookups(row.shopId));
}

async function leaveCreate(auth, value) {
  const staff = await staffService.owned(auth, value.staffId);
  if (await leaves.findByStaffDate(staff.shopId, staff.id, value.date)) throw conflict(MESSAGES.LEAVE_EXISTS);
  const row = await leaves.create({ ...value, accountId: auth.accountId, shopId: staff.shopId });
  return leaveDto(row, staff, await staffService.lookups(staff.shopId));
}

async function leaveUpdate(auth, id, value) {
  const current = await leaves.find(auth.accountId, id);
  if (!current) throw new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.LEAVE_NOT_FOUND);
  const staff = await staffService.owned(auth, value.staffId);
  if (staff.shopId !== current.shopId) throw new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.STAFF_NOT_FOUND);
  if (await leaves.findByStaffDate(staff.shopId, staff.id, value.date, id)) throw conflict(MESSAGES.LEAVE_EXISTS);
  const row = await leaves.update(id, value);
  return leaveDto(row, staff, await staffService.lookups(staff.shopId));
}

async function leaveRemove(auth, id) {
  const row = await leaves.find(auth.accountId, id);
  if (!row) throw new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.LEAVE_NOT_FOUND);
  await leaves.remove(id);
}

async function leaveExportCsv(auth, query) {
  const shop = await resolveShop(auth, query.shopId);
  const rows = shop === null ? [] : await leaveRows(shop, auth);
  return csvService.toCsv(['Staff ID', 'Staff', 'Date', 'Leave Type', 'Start', 'End', 'Half', 'Reason'],
    rows.map((l) => [l.staff.code, l.staff.name, l.date, l.typeLabel, l.startTime ?? '', l.endTime ?? '', l.half ?? '', l.reason]));
}

module.exports = {
  summary, list, exportCsv, checkIn, checkOut, detail, leaveList, leaveSummary, leaveGet, leaveCreate, leaveUpdate, leaveRemove, leaveExportCsv,
};
