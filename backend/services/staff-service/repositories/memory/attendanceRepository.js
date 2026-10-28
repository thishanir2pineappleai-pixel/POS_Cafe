// In-memory ATTENDANCE and LEAVE repository (temporary, see store.js). Starts empty.
// One attendance row per staff member and calendar date (the check-in and, later, the check-out).
const { store, clone } = require('./store');
const { scoped } = require('./scoped');

const attendance = scoped('attendance');
const leaves = scoped('leaves');

module.exports = {
  attendance: {
    ...attendance,
    async findByStaffDate(shopId, staffId, date) {
      const row = [...store.attendance.values()].find((r) => r.shopId === shopId && r.staffId === staffId && r.date === date);
      return row ? clone(row) : null;
    },
    async listByDate(shopId, date) {
      return [...store.attendance.values()].filter((r) => r.shopId === shopId && r.date === date).map(clone);
    },
  },
  leaves: {
    ...leaves,
    async listOn(shopId, date) {
      return [...store.leaves.values()].filter((l) => l.shopId === shopId && l.date === date).map(clone);
    },
    async findByStaffDate(shopId, staffId, date, exceptId = null) {
      const row = [...store.leaves.values()].find((l) => l.shopId === shopId && l.staffId === staffId && l.date === date && l.id !== exceptId);
      return row ? clone(row) : null;
    },
  },
};
