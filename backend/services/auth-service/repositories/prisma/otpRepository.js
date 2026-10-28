// MySQL (Prisma) store for one-time codes and password-reset tokens: the same methods and rows as
// repositories/memory/otpRepository.js. Only keyed HASHES are kept, never a code or token itself.
// One row: { id, purpose, subject, hash, expiresAt, attempts, usedAt, invalidatedAt, createdAt } (times in epoch ms).
const { prisma } = require('./client');
const { toRow, toData } = require('./convert');

const BIG = ['expiresAt', 'usedAt', 'invalidatedAt', 'createdAt'];
const row = (r) => toRow(r, { bigFields: BIG });
const OPEN = { usedAt: null, invalidatedAt: null };

module.exports = {
  async create(record) {
    return row(await prisma.oneTimeCode.create({ data: toData(record, ['purpose', 'subject', 'hash', 'expiresAt', 'createdAt', 'attempts'], BIG) }));
  },
  // Every code ever issued for this purpose and subject, in the order issued.
  async history(purpose, subject) {
    return (await prisma.oneTimeCode.findMany({ where: { purpose, subject }, orderBy: { id: 'asc' } })).map(row);
  },
  // The newest code that is neither used nor invalidated.
  async latestActive(purpose, subject) {
    return row(await prisma.oneTimeCode.findFirst({ where: { purpose, subject, ...OPEN }, orderBy: { id: 'desc' } }));
  },
  async findActiveByHash(purpose, hash) {
    return row(await prisma.oneTimeCode.findFirst({ where: { purpose, hash, ...OPEN }, orderBy: { id: 'asc' } }));
  },
  // patch: { attempts, usedAt, invalidatedAt }; null when the code does not exist.
  async update(id, patch) {
    try {
      return row(await prisma.oneTimeCode.update({ where: { id }, data: toData(patch, ['attempts', 'usedAt', 'invalidatedAt'], BIG) }));
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  },
  async invalidateActive(purpose, subject, at) {
    await prisma.oneTimeCode.updateMany({ where: { purpose, subject, ...OPEN }, data: { invalidatedAt: BigInt(at) } });
  },
};
