// MySQL (Prisma) counterpart of repositories/memory/scoped.js: the small CRUD helper behind roles, teams, shifts, attendance,
// leave and payroll. Every row carries accountId and shopId. Lookups need the caller's accountId, so a row of another account
// simply "does not exist" for the caller, and lists are always limited to one shop.
//
// spec: {
//   model:    the Prisma model delegate name (e.g. 'shift')
//   fields:   columns a caller may write (id, account, shop and timestamps are set by the repository)
//   dates:    columns that are calendar dates ('YYYY-MM-DD' strings in the rows the services use)
//   decimals: money columns (plain numbers in rows)
//   stamps:   columns that are exact instants (ISO strings in rows)
//   uniqueBy: a text column that must be unique within a shop; a clash throws DuplicateError (the database enforces it)
// }
const { prisma } = require('./client');
const { DuplicateError } = require('../errors');

const toDate = (s) => (s === null || s === undefined ? s : new Date(`${s}T00:00:00.000Z`));
const dateText = (d) => (d ? d.toISOString().slice(0, 10) : d);

function converters({ fields, dates = [], decimals = [], stamps = [] }) {
  const toRow = (r) => {
    if (!r) return null;
    const out = { ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() };
    for (const f of dates) out[f] = dateText(r[f]);
    for (const f of decimals) out[f] = r[f] === null ? null : Number(r[f]);
    for (const f of stamps) out[f] = r[f] ? r[f].toISOString() : null;
    return out;
  };
  const toData = (data) => {
    const out = {};
    for (const f of fields) {
      if (data[f] === undefined) continue;
      if (dates.includes(f)) out[f] = toDate(data[f]);
      else if (stamps.includes(f)) out[f] = data[f] === null ? null : new Date(data[f]);
      else out[f] = data[f];
    }
    return out;
  };
  return { toRow, toData };
}

function scoped(spec) {
  const delegate = () => prisma[spec.model];
  const { toRow, toData } = converters(spec);
  const clash = (err) => {
    if (err.code === 'P2002' && spec.uniqueBy) throw new DuplicateError(spec.uniqueBy);
    throw err;
  };

  return {
    toRow,
    toData,
    async list(shopId) {
      return (await delegate().findMany({ where: { shopId }, orderBy: { id: 'asc' } })).map(toRow);
    },
    async find(accountId, id) {
      const row = await delegate().findUnique({ where: { id } });
      return row && row.accountId === accountId ? toRow(row) : null;
    },
    async create(data) {
      try {
        return toRow(await delegate().create({ data: { ...toData(data), accountId: data.accountId, shopId: data.shopId } }));
      } catch (err) { return clash(err); }
    },
    // null when the row does not exist
    async update(id, patch) {
      try {
        return toRow(await delegate().update({ where: { id }, data: toData(patch) }));
      } catch (err) {
        if (err.code === 'P2025') return null;
        return clash(err);
      }
    },
    async remove(id) {
      return (await delegate().deleteMany({ where: { id } })).count > 0;
    },
  };
}

module.exports = { scoped, converters, toDate, dateText };
