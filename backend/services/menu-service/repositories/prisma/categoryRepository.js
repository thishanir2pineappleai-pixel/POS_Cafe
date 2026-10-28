// MySQL (Prisma) category repository, same methods and rows as repositories/memory/categoryRepository.js.
// Names are unique ignoring case: the column's collation is case-insensitive, so findByName and the unique index agree.
const { prisma } = require('./client');

const toRow = (r) => (r ? { id: r.id, name: r.name, createdAt: r.createdAt.toISOString() } : null);

module.exports = {
  async list() {
    return (await prisma.category.findMany({ orderBy: { id: 'asc' } })).map(toRow); // creation order
  },
  async count() {
    return prisma.category.count();
  },
  async findById(id) {
    return toRow(await prisma.category.findUnique({ where: { id } }));
  },
  async findByName(name) {
    return toRow(await prisma.category.findFirst({ where: { name } }));
  },
  async create(name) {
    return toRow(await prisma.category.create({ data: { name } }));
  },
};
