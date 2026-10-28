// MySQL (Prisma) discount DEFINITION repository (name and percentage), same methods and rows as
// repositories/memory/discountRepository.js. Percentages come back as plain numbers.
const { prisma } = require('./client');

const toRow = (r) => (r ? { id: r.id, name: r.name, percentage: Number(r.percentage), createdAt: r.createdAt.toISOString() } : null);

module.exports = {
  async list() {
    return (await prisma.discount.findMany({ orderBy: { id: 'asc' } })).map(toRow);
  },
  async findById(id) {
    return toRow(await prisma.discount.findUnique({ where: { id } }));
  },
  async findByName(name) {
    return toRow(await prisma.discount.findFirst({ where: { name } }));
  },
  async create({ name, percentage }) {
    return toRow(await prisma.discount.create({ data: { name, percentage } }));
  },
};
