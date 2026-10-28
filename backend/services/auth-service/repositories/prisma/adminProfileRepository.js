// MySQL (Prisma) USER repository (the login users: an account's owner and the admins it adds): the same methods and row
// shape as repositories/memory/adminProfileRepository.js. Rows hold a password HASH only; callers that build API output
// drop `passwordHash` (the service does). Emails are unique and compared ignoring case (case-insensitive collation).
const { prisma } = require('./client');
const { toRow, toData } = require('./convert');

const BIG = ['emailVerifiedAt', 'phoneVerifiedAt', 'lastLoginAt'];
const row = (r) => toRow(r, { bigFields: BIG, dateFields: ['createdAt', 'updatedAt'] });

const CREATE_FIELDS = ['accountId', 'role', 'status', 'username', 'firstName', 'lastName', 'phone', 'phoneNormalized', 'email', 'passwordHash', 'emailVerifiedAt', 'phoneVerifiedAt'];
const UPDATE_FIELDS = ['firstName', 'lastName', 'phone', 'email', 'phoneNormalized']; // never the password, role, status or account

module.exports = {
  CREATE_FIELDS,
  BIG,
  row,
  async findById(id) {
    return row(await prisma.user.findUnique({ where: { id } }));
  },
  async findByPhone(normalizedPhone) {
    return row(await prisma.user.findFirst({ where: { phoneNormalized: normalizedPhone }, orderBy: { id: 'asc' } }));
  },
  async findByEmail(email) {
    return row(await prisma.user.findFirst({ where: { email } }));
  },
  async remove(id) {
    await prisma.user.deleteMany({ where: { id } });
  },
  async touchLogin(id, at) {
    await prisma.user.updateMany({ where: { id }, data: { lastLoginAt: BigInt(at) } });
  },
  // Users of one account only (an account never sees another account's people), newest first.
  async listByAccount(accountId) {
    return (await prisma.user.findMany({ where: { accountId }, orderBy: { id: 'desc' } })).map(row);
  },
  // data: { accountId, role, status, firstName, lastName, phone, phoneNormalized, email, passwordHash, ... }
  async create(data) {
    return row(await prisma.user.create({ data: toData(data, CREATE_FIELDS, BIG) }));
  },
  // data: { firstName, lastName, phone, email, phoneNormalized }; null when the user does not exist.
  async update(id, data) {
    try {
      return row(await prisma.user.update({ where: { id }, data: toData(data, UPDATE_FIELDS) }));
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  },
  async setPasswordHash(id, passwordHash) {
    return (await prisma.user.updateMany({ where: { id }, data: { passwordHash } })).count > 0;
  },
  // Returns the previous image file name (or null), or undefined when the user does not exist.
  async setImagePath(id, imagePath) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { id }, select: { imagePath: true } });
      if (!existing) return undefined;
      await tx.user.update({ where: { id }, data: { imagePath } });
      return existing.imagePath;
    });
  },
};
