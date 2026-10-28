// MySQL (Prisma) signup registrations: the same methods and rows as repositories/memory/registrationRepository.js.
// A registration is NOT a user: nobody can sign in until it is activated. Secrets are stored only as hashes and are set to
// NULL at activation. status: email_pending -> owner_pending -> phone_pending -> business_pending -> awaiting_activation -> activated
const { prisma } = require('./client');
const { toRow, toData } = require('./convert');

const BIG = ['tokenExpiresAt', 'termsAcceptedAt', 'emailVerifiedAt', 'phoneVerifiedAt', 'createdAt', 'accessKeyExpiresAt', 'activatedAt'];
const FIELDS = [
  'tokenHash', 'tokenExpiresAt', 'email', 'username', 'passwordHash', 'termsAcceptedAt', 'status', 'emailVerifiedAt', 'phoneVerifiedAt', 'createdAt',
  'ownerName', 'phone', 'phoneNormalized', 'businessName', 'address', 'accessKeyHash', 'accessKeyExpiresAt', 'accessKeyAttempts', 'accessKeySends', 'activatedAt',
];
const row = (r) => toRow(r, { bigFields: BIG });

module.exports = {
  async create(data) {
    return row(await prisma.registration.create({ data: toData(data, FIELDS, BIG) }));
  },
  async findById(id) {
    return row(await prisma.registration.findUnique({ where: { id } }));
  },
  async findByTokenHash(tokenHash) {
    return row(await prisma.registration.findUnique({ where: { tokenHash } }));
  },
  // The unfinished (not yet activated) registration for this email, ignoring case.
  async findOpenByEmail(email) {
    return row(await prisma.registration.findFirst({ where: { email, status: { not: 'activated' } }, orderBy: { id: 'asc' } }));
  },
  // patch: any of the registration columns; null when it does not exist.
  async update(id, patch) {
    try {
      return row(await prisma.registration.update({ where: { id }, data: toData(patch, FIELDS, BIG) }));
    } catch (err) {
      if (err.code === 'P2025') return null;
      throw err;
    }
  },
  async remove(id) {
    await prisma.registration.deleteMany({ where: { id } });
  },
};
