// MySQL (Prisma) repository for Sales discount APPLICATIONS: the same methods and row shapes as the in-memory one
// (repositories/memory/discountApplicationRepository.js). Percentages come back as plain numbers and dates as 'YYYY-MM-DD',
// product ids in ascending order. Applications belong to an ACCOUNT. The application row and its product rows are saved together.
const { prisma } = require('./client');
const { formatAppliesTo } = require('../../utils/formatter');
const { toCents, toDecimalString } = require('../../utils/money');

const INCLUDE = { products: { orderBy: { productId: 'asc' } } };
const day = (text) => new Date(`${text}T00:00:00.000Z`);
const percentage = (value) => toDecimalString(toCents(value));

function toRow(a) {
  return {
    id: a.id,
    accountId: a.accountId,
    discountId: a.discountId,
    discountName: a.discountName,
    discountPercentage: Number(a.discountPercentage),
    startDate: a.startDate.toISOString().slice(0, 10),
    endDate: a.endDate.toISOString().slice(0, 10),
    status: a.status,
    appliesToAll: a.appliesToAll,
    productIds: a.products.map((p) => p.productId),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

const columns = (d) => ({
  discountId: d.discountId,
  discountName: d.discountName,
  discountPercentage: percentage(d.discountPercentage),
  startDate: day(d.startDate),
  endDate: day(d.endDate),
  status: d.status,
  appliesToAll: d.appliesToAll,
});
const productRows = (ids) => [...ids].sort((a, b) => a - b).map((productId) => ({ productId }));

const searchableText = (a) => [a.discountName, 'Percentage', `${a.discountPercentage} %`, formatAppliesTo(a.appliesToAll, a.productIds.length), a.status];

module.exports = {
  // ponytail: the account's applications are loaded and searched in JS (the search covers computed text). A cafe has a
  // handful of applications; move the search into SQL if that ever changes.
  async list({ accountId, search, offset, limit }) {
    const needle = search ? search.toLowerCase() : null;
    const rows = (await prisma.discountApplication.findMany({ where: { accountId }, include: INCLUDE, orderBy: { id: 'desc' } }))
      .map(toRow)
      .filter((a) => !needle || searchableText(a).some((t) => t && t.toLowerCase().includes(needle)));
    return { total: rows.length, rows: rows.slice(offset, offset + limit) };
  },

  async findById(id, { accountId }) {
    const a = await prisma.discountApplication.findFirst({ where: { id, accountId }, include: INCLUDE });
    return a ? toRow(a) : null;
  },

  async create(data) {
    const a = await prisma.discountApplication.create({
      data: { accountId: data.accountId, ...columns(data), products: { create: productRows(data.productIds) } },
      include: INCLUDE,
    });
    return toRow(a);
  },

  // Replaces the columns and the whole product list in one transaction; null when not found in this account.
  async update(id, { accountId }, data) {
    return prisma.$transaction(async (tx) => {
      if (!(await tx.discountApplication.findFirst({ where: { id, accountId }, select: { id: true } }))) return null;
      await tx.discountApplicationProduct.deleteMany({ where: { applicationId: id } });
      return toRow(await tx.discountApplication.update({
        where: { id },
        data: { ...columns(data), products: { create: productRows(data.productIds) } },
        include: INCLUDE,
      }));
    });
  },

  async setStatus(id, { accountId }, status) {
    const { count } = await prisma.discountApplication.updateMany({ where: { id, accountId }, data: { status } });
    if (count === 0) return null;
    return toRow(await prisma.discountApplication.findUnique({ where: { id }, include: INCLUDE }));
  },

  // Removes the application and its product rows (cascade), nothing else. Returns true when it existed.
  async remove(id, { accountId }) {
    const { count } = await prisma.discountApplication.deleteMany({ where: { id, accountId } });
    return count > 0;
  },

  async findActiveOn({ accountId, date }) {
    const rows = await prisma.discountApplication.findMany({
      where: { accountId, status: 'Active', startDate: { lte: day(date) }, endDate: { gte: day(date) } },
      include: INCLUDE,
    });
    return rows.map(toRow);
  },
};
