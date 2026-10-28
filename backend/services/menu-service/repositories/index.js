// The one place that decides which storage the Menu Service uses (REPOSITORY_DRIVER):
//   memory  (default) in-memory repositories: data is LOST on restart, no database needed (development and tests)
//   prisma  MySQL (pos_menu_db) through Prisma: data persists (see README, "Database")
const { env } = require('../config');

const driver = env.repositoryDriver === 'prisma' ? 'prisma' : 'memory';

module.exports = {
  menuRepository: require(`./${driver}/menuRepository`),
  categoryRepository: require(`./${driver}/categoryRepository`),
  ingredientRepository: require(`./${driver}/ingredientRepository`),
  discountRepository: require(`./${driver}/discountRepository`), // discount DEFINITIONS (applications belong to Sales)
};
