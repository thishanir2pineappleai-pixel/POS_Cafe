// MySQL (Prisma) sessions: the same methods and rows as repositories/memory/sessionRepository.js. An access token carries a
// session id; the token only works while its session exists and is neither revoked nor expired. Because sessions are in the
// database, they survive a restart of this service (with the in-memory driver every sign-in ends on restart).
const crypto = require('node:crypto');
const { prisma } = require('./client');
const { toRow } = require('./convert');

const BIG = ['expiresAt', 'createdAt', 'revokedAt'];
const row = (r) => toRow(r, { bigFields: BIG });

module.exports = {
  async create({ userId, accountId, expiresAt, createdAt }) {
    return row(await prisma.session.create({ data: { sid: crypto.randomUUID(), userId, accountId, expiresAt: BigInt(expiresAt), createdAt: BigInt(createdAt) } }));
  },
  async find(sid) {
    return row(await prisma.session.findUnique({ where: { sid } }));
  },
  async revoke(sid, at) {
    await prisma.session.updateMany({ where: { sid, revokedAt: null }, data: { revokedAt: BigInt(at) } });
  },
  // Ends every session of a user, optionally keeping one (the session that is making the change). Returns how many ended.
  async revokeAllForUser(userId, at, exceptSid = null) {
    const where = { userId, revokedAt: null, ...(exceptSid ? { sid: { not: exceptSid } } : {}) };
    return (await prisma.session.updateMany({ where, data: { revokedAt: BigInt(at) } })).count;
  },
};
