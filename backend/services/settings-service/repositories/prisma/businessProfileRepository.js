// MySQL (Prisma) shop profile repository: the same methods and the same row shape as the in-memory one
// (repositories/memory/businessProfileRepository.js), so the service does not know which one it talks to.
// Dates are returned as ISO strings, like the memory rows, so API responses are identical.
const { prisma } = require('./client');

const FIELDS = ['name', 'address', 'phone', 'email', 'website', 'timezone'];

const toRow = (r) => (r ? { ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() } : null);
const pick = (data) => Object.fromEntries(FIELDS.filter((f) => data[f] !== undefined).map((f) => [f, data[f]]));

module.exports = {
  // Shops of one account only, newest first.
  async listByAccount(accountId) {
    return (await prisma.shopProfile.findMany({ where: { accountId }, orderBy: { id: 'desc' } })).map(toRow);
  },
  async findById(id) {
    return toRow(await prisma.shopProfile.findUnique({ where: { id } }));
  },
  // data: { name, address, phone, email, website, timezone, accountId, ownerId }
  async create(data) {
    return toRow(await prisma.shopProfile.create({ data: { ...pick(data), accountId: data.accountId, ownerId: data.ownerId ?? null } }));
  },
  // Replaces the text fields; null when the shop does not exist.
  async update(id, data) {
    try {
      return toRow(await prisma.shopProfile.update({ where: { id }, data: pick(data) }));
    } catch (err) {
      if (err.code === 'P2025') return null; // record not found
      throw err;
    }
  },
  // Returns the previous image file name (or null), or undefined when the shop does not exist.
  async setImagePath(id, imagePath) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.shopProfile.findUnique({ where: { id } });
      if (!existing) return undefined;
      await tx.shopProfile.update({ where: { id }, data: { imagePath } });
      return existing.imagePath;
    });
  },
};
