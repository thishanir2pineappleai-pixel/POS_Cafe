// The one place that decides which storage the Staff Service uses (REPOSITORY_DRIVER):
//   memory  (default) in-memory repositories: data is LOST on restart, no database needed (development and tests)
//   prisma  MySQL (pos_staff_db) through Prisma: data persists (see README, "Database")
const { env } = require('../config');

const driver = env.repositoryDriver === 'prisma' ? 'prisma' : 'memory';

module.exports = {
  staffRepository: require(`./${driver}/staffRepository`),
  staffRoleRepository: require(`./${driver}/staffRoleRepository`), // { roles, teams }
  shiftRepository: require(`./${driver}/shiftRepository`), // shift definitions + weekly roster
  attendanceRepository: require(`./${driver}/attendanceRepository`), // { attendance, leaves }
  payrollRepository: require(`./${driver}/payrollRepository`), // { records, rewards, deductions }
};
