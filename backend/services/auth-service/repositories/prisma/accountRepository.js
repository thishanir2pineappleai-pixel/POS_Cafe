// MySQL (Prisma) account repository. Creates an account together with its owner in ONE transaction (the account row and the
// user row exist afterwards, or neither does). The owner's first shop belongs to the Settings Service, which the caller
// asks right after this (and undoes this with removeOwner if that fails).
const { prisma } = require('./client');
const { toData } = require('./convert');
const users = require('./adminProfileRepository');

module.exports = {
  // owner: user columns. Returns { accountId, owner }.
  async createWithOwner({ owner }) {
    return prisma.$transaction(async (tx) => {
      const account = await tx.account.create({ data: {} });
      const created = await tx.user.create({ data: { ...toData(owner, users.CREATE_FIELDS, users.BIG), accountId: account.id } });
      return { accountId: account.id, owner: users.row(created) };
    });
  },
  // Rolls back createWithOwner: removes the owner and the account if nobody else belongs to it.
  async removeOwner(ownerId) {
    await prisma.$transaction(async (tx) => {
      const owner = await tx.user.findUnique({ where: { id: ownerId }, select: { accountId: true } });
      if (!owner) return;
      await tx.session.deleteMany({ where: { userId: ownerId } });
      await tx.user.delete({ where: { id: ownerId } });
      if ((await tx.user.count({ where: { accountId: owner.accountId } })) === 0) await tx.account.delete({ where: { id: owner.accountId } });
    });
  },
};
