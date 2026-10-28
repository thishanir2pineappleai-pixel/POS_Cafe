// TEMPORARY IN-MEMORY STORAGE of the Staff Service (development default, no database needed).
//
//   * Everything here is LOST WHEN THE SERVICE RESTARTS. Nothing is seeded: every collection starts empty.
//   * The Staff Service owns staff, roles, teams, shifts, the weekly roster, attendance, leave and payroll. Every row
//     carries accountId + shopId (ids owned by the Auth and Settings services) so each shop only sees its own data.
//   * Uploaded picture and document FILES are written to services/staff-service/uploads and are NOT lost on restart, but
//     the staff rows that reference them are, so old files become orphans until database persistence exists.
//
// The proposed MySQL tables are in docs/staff-management-schema.md. Services and controllers never touch this file.
const clock = require('@pos-cafe/shared/clock');

const emptyStore = () => ({
  staff: new Map(), // id -> staff row (password HASH only, never the password)
  staffRoles: new Map(), // id -> { id, accountId, shopId, name, grants: { 'Staff Management': ['view', ...] } }
  staffTeams: new Map(), // id -> { id, accountId, shopId, name }
  shifts: new Map(), // id -> { id, accountId, shopId, name, startTime, endTime, active }
  roster: new Map(), // staffId -> { mon: shiftId | 'off', tue: ... } (a missing day = nothing assigned yet)
  attendance: new Map(), // id -> { id, accountId, shopId, staffId, date, checkInAt, checkOutAt }
  leaves: new Map(), // id -> leave row
  payrollRecords: new Map(), // id -> payroll row
  payrollRewards: new Map(),
  payrollDeductions: new Map(),
  rateLimits: new Map(), // "name:key" -> [timestamps]
  lastId: {
    staff: 0, staffRoles: 0, staffTeams: 0, shifts: 0, attendance: 0, leaves: 0, payrollRecords: 0, payrollRewards: 0, payrollDeductions: 0,
  },
});

const store = emptyStore();

function nextId(table) {
  store.lastId[table] += 1;
  return store.lastId[table];
}

// Used by the automated tests to start from empty collections. The rate limiter keeps a reference to the rateLimits Map,
// so its contents are cleared instead of the Map being replaced.
function reset() {
  store.rateLimits.clear();
  const { rateLimits } = store;
  Object.assign(store, emptyStore(), { rateLimits });
  clock.reset();
}

const clone = (value) => structuredClone(value);
const now = () => new Date().toISOString();

module.exports = { store, nextId, reset, clone, now };
