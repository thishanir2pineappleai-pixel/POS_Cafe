// In-memory repository of SHIFT definitions and the weekly roster (temporary, see store.js). Starts empty.
// A shift name is unique within a shop, ignoring case. The roster keeps ONE value per staff member and weekday
// (a shift id, or 'off'), so a person can never hold two shifts on the same day.
const { store, clone } = require('./store');
const { scoped } = require('./scoped');

const shifts = scoped('shifts', { uniqueBy: 'name' });

module.exports = {
  ...shifts,
  async getRoster(staffId) {
    return clone(store.roster.get(staffId) || {});
  },
  async setRoster(staffId, days) {
    store.roster.set(staffId, { ...days });
  },
  async clearRoster(staffId) {
    store.roster.delete(staffId);
  },
  // Is any roster entry of this shop still pointing at the shift?
  async isRostered(shopId, shiftId) {
    return [...store.roster.entries()].some(([staffId, days]) => store.staff.get(staffId)?.shopId === shopId && Object.values(days).includes(shiftId));
  },
};
