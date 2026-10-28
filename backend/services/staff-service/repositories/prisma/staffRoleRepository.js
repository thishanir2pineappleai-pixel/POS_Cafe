// MySQL (Prisma) staff ROLES (with their permission grants) and TEAMS: same methods and rows as
// repositories/memory/staffRoleRepository.js. Names are unique within a shop, ignoring case (unique index).
const { scoped } = require('./scoped');

module.exports = {
  roles: scoped({ model: 'staffRole', fields: ['name', 'grants'], uniqueBy: 'name' }),
  teams: scoped({ model: 'staffTeam', fields: ['name'], uniqueBy: 'name' }),
};
