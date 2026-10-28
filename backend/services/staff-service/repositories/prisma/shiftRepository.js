// MySQL (Prisma) shift definitions and weekly roster: same methods and rows as repositories/memory/shiftRepository.js.
// The roster of a staff member is { mon: shiftId | 'off', tue: ... }; a weekday with no row has nothing assigned yet.
const { prisma } = require('./client');
const { scoped } = require('./scoped');

const shifts = scoped({ model: 'shift', fields: ['name', 'startTime', 'endTime', 'active'], uniqueBy: 'name' });

const toDays = (rows) => Object.fromEntries(rows.map((r) => [r.weekday, r.isOff ? 'off' : r.shiftId]));
const toRows = (staffId, days) => Object.entries(days).map(([weekday, v]) => ({ staffId, weekday, shiftId: v === 'off' ? null : v, isOff: v === 'off' }));

module.exports = {
  ...shifts,
  async getRoster(staffId) {
    return toDays(await prisma.shiftAssignment.findMany({ where: { staffId } }));
  },
  // Replaces the whole roster of one staff member in one transaction.
  async setRoster(staffId, days) {
    await prisma.$transaction([
      prisma.shiftAssignment.deleteMany({ where: { staffId } }),
      prisma.shiftAssignment.createMany({ data: toRows(staffId, days) }),
    ]);
  },
  async clearRoster(staffId) {
    await prisma.shiftAssignment.deleteMany({ where: { staffId } });
  },
  // Is this shift on the roster of anyone in the shop?
  async isRostered(shopId, shiftId) {
    return (await prisma.shiftAssignment.count({ where: { shiftId, staff: { shopId } } })) > 0;
  },
  toDays,
  toRows,
};
