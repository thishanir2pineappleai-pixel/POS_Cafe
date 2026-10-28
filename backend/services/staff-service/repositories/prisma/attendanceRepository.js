// MySQL (Prisma) attendance records and leave: same methods and rows as repositories/memory/attendanceRepository.js.
// Check-in/out times are the shop's local clock time kept as text ("YYYY-MM-DDTHH:mm:ss"), exactly as the service writes them.
const { prisma } = require('./client');
const { scoped } = require('./scoped');

const attendance = scoped({ model: 'attendance', fields: ['staffId', 'date', 'checkInAt', 'checkOutAt'], dates: ['date'] });
const leaves = scoped({ model: 'leave', fields: ['staffId', 'type', 'date', 'startTime', 'endTime', 'half', 'reason'], dates: ['date'] });
const day = (date) => new Date(`${date}T00:00:00.000Z`);

module.exports = {
  attendance: {
    ...attendance,
    async findByStaffDate(shopId, staffId, date) {
      return attendance.toRow(await prisma.attendance.findFirst({ where: { shopId, staffId, date: day(date) } }));
    },
    async listByDate(shopId, date) {
      return (await prisma.attendance.findMany({ where: { shopId, date: day(date) }, orderBy: { id: 'asc' } })).map(attendance.toRow);
    },
  },
  leaves: {
    ...leaves,
    async listOn(shopId, date) {
      return (await prisma.leave.findMany({ where: { shopId, date: day(date) }, orderBy: { id: 'asc' } })).map(leaves.toRow);
    },
    // The leave of this staff member on this date, optionally ignoring one leave (when it is being edited).
    async findByStaffDate(shopId, staffId, date, exceptId = null) {
      return leaves.toRow(await prisma.leave.findFirst({ where: { shopId, staffId, date: day(date), ...(exceptId ? { id: { not: exceptId } } : {}) } }));
    },
  },
};
