// The one place that decides which storage the Settings Service uses (REPOSITORY_DRIVER):
//   memory  (default) in-memory repositories: data is LOST on restart, no database needed (development and tests)
//   prisma  MySQL (pos_settings_db) through Prisma: data persists (see README, "Database")
const { env } = require('../config');

module.exports = env.repositoryDriver === 'prisma'
  ? { businessProfileRepository: require('./prisma/businessProfileRepository') } // shop profiles
  : { businessProfileRepository: require('./memory/businessProfileRepository') };
