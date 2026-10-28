// In-memory PAYROLL repository: payroll records, rewards and deductions (temporary, see store.js). Starts empty.
const { store, clone } = require('./store');
const { scoped } = require('./scoped');

module.exports = {
  records: {
    ...scoped('payrollRecords'),
    async findByStaffMonth(shopId, staffId, month, exceptId = null) {
      const row = [...store.payrollRecords.values()].find((r) => r.shopId === shopId && r.staffId === staffId && r.payDate.slice(0, 7) === month && r.id !== exceptId);
      return row ? clone(row) : null;
    },
  },
  rewards: scoped('payrollRewards'),
  deductions: scoped('payrollDeductions'),
};
