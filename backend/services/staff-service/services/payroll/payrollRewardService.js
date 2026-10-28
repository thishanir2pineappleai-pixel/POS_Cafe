// Rewards and deductions of the Payroll tab ("Add Reward", "Add Deduction", their lists and edit/delete dialogs).
// Owner only (see routes/v1/payrollRoutes.js). Amounts: see payrollService.js for how they reach a payroll record.
// One factory builds both, because they differ only in the amount fields and the messages.
const { payrollRepository, staffRepository } = require('../../repositories');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('../../config/constants/messages');
const { buildMeta } = require('@pos-cafe/shared/pagination');
const csvService = require('@pos-cafe/shared/csv');
const staffService = require('../user/staffService');
const { resolveShop } = require('../user/shopScope');

function entryService(repo, { notFound, amountFields, csvHeaders }) {
  const find = async (auth, id) => {
    const row = await repo.find(auth.accountId, id);
    const staff = row && await staffRepository.findById(auth.accountId, row.staffId);
    if (!row || !staff) throw new AppError(404, ERROR_CODES.NOT_FOUND, notFound);
    return { row, staff };
  };
  const toDto = (row, staff, lk) => ({
    id: row.id,
    staff: staffService.briefStaff(staff, lk),
    date: row.date,
    reason: row.reason,
    specificReason: row.specificReason,
    ...Object.fromEntries(amountFields.map((f) => [f, row[f]])),
  });
  const rowsOf = async (auth, query) => {
    const shop = await resolveShop(auth, query.shopId);
    if (shop === null) return [];
    const lk = await staffService.lookups(shop);
    const staffById = new Map((await staffRepository.list(shop)).map((s) => [s.id, s]));
    return (await repo.list(shop))
      .filter((r) => staffById.has(r.staffId) && (query.staffId === undefined || r.staffId === query.staffId) && (query.date === undefined || r.date === query.date))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .map((r) => toDto(r, staffById.get(r.staffId), lk));
  };
  return {
    async list(auth, query) {
      const rows = await rowsOf(auth, query);
      return { items: rows.slice((query.page - 1) * query.limit, query.page * query.limit), meta: buildMeta(rows.length, query.page, query.limit) };
    },
    async exportCsv(auth, query) {
      const rows = await rowsOf(auth, query);
      return csvService.toCsv(csvHeaders, rows.map((r) => [r.staff.code, r.staff.name, r.date, r.specificReason ?? r.reason, ...amountFields.map((f) => r[f])]));
    },
    async get(auth, id) {
      const { row, staff } = await find(auth, id);
      return toDto(row, staff, await staffService.lookups(row.shopId));
    },
    async create(auth, value) {
      const staff = await staffService.owned(auth, value.staffId);
      const row = await repo.create({ ...value, accountId: auth.accountId, shopId: staff.shopId });
      return toDto(row, staff, await staffService.lookups(staff.shopId));
    },
    async update(auth, id, value) {
      const { row } = await find(auth, id);
      const staff = await staffService.owned(auth, value.staffId);
      if (staff.shopId !== row.shopId) throw new AppError(404, ERROR_CODES.NOT_FOUND, MESSAGES.STAFF_NOT_FOUND);
      return toDto(await repo.update(id, value), staff, await staffService.lookups(row.shopId));
    },
    async remove(auth, id) {
      const { row } = await find(auth, id);
      await repo.remove(row.id);
    },
  };
}

const { rewards, deductions } = payrollRepository;

module.exports = {
  rewardService: entryService(rewards, { notFound: MESSAGES.REWARD_NOT_FOUND, amountFields: ['amount'], csvHeaders: ['Staff ID', 'Staff', 'Date', 'Reason', 'Amount'] }),
  deductionService: entryService(deductions, {
    notFound: MESSAGES.DEDUCTION_NOT_FOUND, amountFields: ['totalAmount', 'monthlyAmount'], csvHeaders: ['Staff ID', 'Staff', 'Date', 'Reason', 'Total Amount', 'Monthly Deduction Amount'],
  }),
};
