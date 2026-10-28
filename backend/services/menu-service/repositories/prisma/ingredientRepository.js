// MySQL (Prisma) ingredient repository, same methods and rows as repositories/memory/ingredientRepository.js.
const { prisma } = require('./client');

const SEARCH_LIMIT = 50;
const toRow = (r) => (r ? { id: r.id, name: r.name, createdAt: r.createdAt.toISOString() } : null);

const repository = {
  // Autocomplete: names containing the text, ignoring case, in creation order.
  async search(term) {
    const where = term ? { name: { contains: term } } : {};
    return (await prisma.ingredient.findMany({ where, orderBy: { id: 'asc' }, take: SEARCH_LIMIT })).map(toRow);
  },
  async findById(id) {
    return toRow(await prisma.ingredient.findUnique({ where: { id } }));
  },
  async findByName(name) {
    return toRow(await prisma.ingredient.findFirst({ where: { name } }));
  },
  async create(name) {
    return toRow(await prisma.ingredient.create({ data: { name } }));
  },
  // Two requests adding the same new name at once: the unique index lets one win and the other reads the winner's row.
  async findOrCreateByName(name) {
    const existing = await repository.findByName(name);
    if (existing) return existing;
    try {
      return await repository.create(name);
    } catch (err) {
      if (err.code === 'P2002') return repository.findByName(name);
      throw err;
    }
  },
};

module.exports = repository;
