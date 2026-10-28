// In-memory repository of staff ROLES (with their permission grants) and TEAMS (temporary, see store.js).
// Names are unique within a shop, ignoring case. Starts empty: no role or team is seeded.
const { scoped } = require('./scoped');

module.exports = {
  roles: scoped('staffRoles', { uniqueBy: 'name' }),
  teams: scoped('staffTeams', { uniqueBy: 'name' }),
};
