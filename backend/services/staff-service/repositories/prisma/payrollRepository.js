// MySQL (Prisma) payroll records, rewards and deductions: same methods and rows as repositories/memory/payrollRepository.js.
// Money comes back as plain numbers. `snapshot` ({ rewards, deductions, netPay }) is the frozen figures of a paid record.
const { prisma } = require('./client');
const { scoped, toDate } = require('./scoped');

const records = scoped({ model: 'payrollRecord', fields: ['staffId', 'payDate', 'basicSalary', 'paidOn', 'snapshot'], dates: ['payDate'], decimals: ['basicSalary'], stamps: ['paidOn'] });

// Prisma stores a JSON null as a special value; a plain "no snapshot" is the database NULL.
const withSnapshot = (data) => (data.snapshot === null ? { ...data, snapshot: undefined } : data);
const snapshotOf = (row) => (row ? { ...row, snapshot: row.snapshot ?? null } : row);

module.exports = {
  records: {
    ...records,
    async create(data) {
      return snapshotOf(await records.create(withSnapshot(data)));
    },
    async update(id, patch) {
      return snapshotOf(await records.update(id, patch.snapshot === null ? { ...patch, snapshot: undefined } : patch));
    },
    async find(accountId, id) {
      return snapshotOf(await records.find(accountId, id));
    },
    async list(shopId) {
      return (await records.list(shopId)).map(snapshotOf);
    },
    // The record of this staff member whose pay date is in this month ('YYYY-MM'), optionally ignoring one record.
    async findByStaffMonth(shopId, staffId, month, exceptId = null) {
      const from = toDate(`${month}-01`);
      const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
      return snapshotOf(records.toRow(await prisma.payrollRecord.findFirst({
        where: { shopId, staffId, payDate: { gte: from, lt: to }, ...(exceptId ? { id: { not: exceptId } } : {}) },
      })));
    },
  },
  rewards: scoped({ model: 'payrollReward', fields: ['staffId', 'date', 'reason', 'specificReason', 'amount'], dates: ['date'], decimals: ['amount'] }),
  deductions: scoped({ model: 'payrollDeduction', fields: ['staffId', 'date', 'reason', 'specificReason', 'totalAmount', 'monthlyAmount'], dates: ['date'], decimals: ['totalAmount', 'monthlyAmount'] }),
};
