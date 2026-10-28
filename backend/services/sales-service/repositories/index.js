// The one place that decides which storage the Sales Service uses (REPOSITORY_DRIVER):
//   memory  (default) in-memory repositories: data is LOST on restart, no database needed (development and tests)
//   prisma  MySQL (pos_sales_db) through Prisma: data persists (see README, "Database")
const { env } = require('../config');

const driver = env.repositoryDriver === 'prisma' ? 'prisma' : 'memory';

module.exports = {
  orderRepository: require(`./${driver}/orderRepository`),
  discountApplicationRepository: require(`./${driver}/discountApplicationRepository`),
};
