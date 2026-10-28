// The one place that decides which storage the Auth Service uses (REPOSITORY_DRIVER):
//   memory  (default) in-memory repositories: data is LOST on restart and every sign-in ends, no database needed
//           (development and tests)
//   prisma  MySQL (pos_auth_db) through Prisma: accounts, users, sessions and signups persist (see README, "Database")
const { env } = require('../config');

const driver = env.repositoryDriver === 'prisma' ? 'prisma' : 'memory';

module.exports = {
  adminProfileRepository: require(`./${driver}/adminProfileRepository`), // the login users
  accountRepository: require(`./${driver}/accountRepository`),
  sessionRepository: require(`./${driver}/sessionRepository`),
  otpRepository: require(`./${driver}/otpRepository`),
  registrationRepository: require(`./${driver}/registrationRepository`),
};
