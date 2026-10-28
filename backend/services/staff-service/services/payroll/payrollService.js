// Payroll (Payroll tab): pay records, summary cards, overview chart, staff payroll details, rewards and deductions.
// OWNER ONLY: every route is limited to the account's owner (routes/v1/payrollRoutes.js), and every row is limited to
// one shop of the caller's account.
//
// WHAT THE FIGMA DEFINES AND IS BUILT:
//   * Net Pay = Basic Salary + Rewards - Deductions (the Figma rows add up that way, e.g. 45,000 + 12,000 - 8,000 = 49,000).
//   * Status Pending / Overdue / Paid, a Pay Date, a PAY button that marks a record paid, editing Basic Salary and Pay Date.
//   * Rewards (reason, date, amount) and Deductions (reason, date, total amount, monthly deduction amount).
// PENDING APPROVAL, provisional rules used so the numbers can be calculated:
//   * A record belongs to the calendar month of its Pay Date; one record per staff member per month.
//   * Its rewards are the staff member's rewards dated in that month; its deductions are the MONTHLY deduction amounts of
//     deductions dated in that month (how a total amount is spread over later months is not defined).
//   * Pending = unpaid with a Pay Date today or later, Overdue = unpaid with a Pay Date in the past.
//   * PAY only records "paid" with the time; there is no payment processing. Paying freezes the amounts (a snapshot).
// NOT BUILT, rule missing: "Process Payroll" for all staff, the EPF/ETF totals card, tax, approvals, PDF/XLS export.
const { payrollRepository, staffRepository } = require('../../repositories');
const { ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('../../config/constants/messages');
const { PAYROLL_STATUS } = require('../../config/constants/staff');
const clock = require('@pos-cafe/shared/clock');
const { localDate, previousMonth } = require('@pos-cafe/shared/date');
const { buildMeta } = require('@pos-cafe/shared/pagination');
const csvService = require('@pos-cafe/shared/csv');
const staffService = require('../user/staffService');
const { resolveShop } = require('../user/shopScope');

const { records, rewards, deductions } = payrollRepository;
const money = (n) => Math.round(n * 100) / 100;
const notFound = (message) => new AppError(404, ERROR_CODES.NOT_FOUND, message);
const conflict = (message) => new AppError(409, ERROR_CODES.CONFLICT, message);
const monthOf = (date) => date.slice(0, 7);
const sum = (rows, field) => money(rows.reduce((t, r) => t + r[field], 0));

// Rewards and deductions of one staff member in one month.
async function monthEntries(shopId, staffId, month) {
  const inMonth = (r) => r.staffId === staffId && monthOf(r.date) === month;
  return {
    rewards: (await rewards.list(shopId)).filter(inMonth),
    deductions: (await deductions.list(shopId)).filter(inMonth),
  };
}

function statusOf(row, today) {
  if (row.paidOn) return PAYROLL_STATUS.PAID;
  return row.payDate < today ? PAYROLL_STATUS.OVERDUE : PAYROLL_STATUS.PENDING;
}

async function figures(row) {
  if (row.snapshot) return row.snapshot; // paid: frozen
  const e = await monthEntries(row.shopId, row.staffId, monthOf(row.payDate));
  const rewardTotal = sum(e.rewards, 'amount');
  const deductionTotal = sum(e.deductions, 'monthlyAmount');
  return { rewards: rewardTotal, deductions: deductionTotal, netPay: money(row.basicSalary + rewardTotal - deductionTotal) };
}

async function dto(row, staff, lk, today) {
  const f = await figures(row);
  return {
    id: row.id,
    staff: staffService.briefStaff(staff, lk),
    payDate: row.payDate,
    basicSalary: row.basicSalary,
    rewards: f.rewards,
    deductions: f.deductions,
    netPay: f.netPay,
    status: statusOf(row, today),
    paidOn: row.paidOn ?? null,
  };
}

async function allRows(shopId, today) {
  const lk = await staffService.lookups(shopId);
  const staffById = new Map((await staffRepository.list(shopId)).map((s) => [s.id, s]));
  const rows = [];
  for (const r of await records.list(shopId)) {
    const staff = staffById.get(r.staffId);
    if (staff) rows.push(await dto(r, staff, lk, today));
  }
  return rows.sort((a, b) => b.payDate.localeCompare(a.payDate) || b.id - a.id);
}

async function filtered(auth, query) {
  const shop = await resolveShop(auth, query.shopId);
  if (shop === null) return [];
  const needle = query.q?.toLowerCase().replace(/^#/, '');
  return (await allRows(shop, localDate(clock.now()))).filter((r) => (
    (query.status === undefined || r.status === query.status)
    && (query.roleId === undefined || r.staff.role?.id === query.roleId)
    && (query.staffId === undefined || r.staff.id === query.staffId)
    && (query.month === undefined || monthOf(r.payDate) === query.month)
    && (needle === undefined || r.staff.name.toLowerCase().includes(needle) || r.staff.code.toLowerCase().includes(needle))
  ));
}

async function list(auth, query) {
  const rows = await filtered(auth, query);
  return { items: rows.slice((query.page - 1) * query.limit, query.page * query.limit), meta: buildMeta(rows.length, query.page, query.limit) };
}

async function exportCsv(auth, query) {
  const rows = await filtered(auth, query);
  return csvService.toCsv(['Staff ID', 'Staff', 'Basic Salary', 'Rewards', 'Deductions', 'Net Pay', 'Status', 'Pay Date'],
    rows.map((r) => [r.staff.code, r.staff.name, r.basicSalary, r.rewards, r.deductions, r.netPay, r.status, r.payDate]));
}

// ---- cards, chart, upcoming payroll ----
const change = (now, before) => (before === 0 ? null : Math.round(((now - before) / before) * 1000) / 10);

async function summary(auth, { month, shopId }) {
  const shop = await resolveShop(auth, shopId);
  const today = localDate(clock.now());
  const rows = shop === null ? [] : await allRows(shop, today);
  const totals = (m) => {
    const inMonth = rows.filter((r) => monthOf(r.payDate) === m);
    return { basic: sum(inMonth, 'basicSalary'), rewards: sum(inMonth, 'rewards'), deductions: sum(inMonth, 'deductions'), net: sum(inMonth, 'netPay') };
  };
  const now = totals(month);
  const before = totals(previousMonth(month));
  const upcoming = rows.filter((r) => r.status !== PAYROLL_STATUS.PAID && r.payDate >= today).sort((a, b) => a.payDate.localeCompare(b.payDate))[0];
  const count = (status) => rows.filter((r) => r.status === status).length;
  return {
    month,
    totalBasicSalary: { value: now.basic, changePercent: change(now.basic, before.basic) },
    totalReward: { value: now.rewards, changePercent: change(now.rewards, before.rewards) },
    totalDeductions: { value: now.deductions, changePercent: change(now.deductions, before.deductions) }, // the Figma's "Total Damages"
    totalNetCost: { value: now.net, changePercent: change(now.net, before.net) },
    upcomingPayroll: upcoming
      ? { nextPayDate: upcoming.payDate, daysRemaining: Math.round((Date.parse(upcoming.payDate) - Date.parse(today)) / 86400000) }
      : { nextPayDate: null, daysRemaining: null },
    // PENDING APPROVAL: counted over all of the shop's records, because overdue records belong to earlier months.
    payrollStatus: { overdue: count(PAYROLL_STATUS.OVERDUE), pending: count(PAYROLL_STATUS.PENDING), paid: count(PAYROLL_STATUS.PAID) },
  };
}

// The "Payroll Overview" lines: total deductions, total salary and total net pay for each of the last N months.
async function overview(auth, { month, months, shopId }) {
  const shop = await resolveShop(auth, shopId);
  const rows = shop === null ? [] : await allRows(shop, localDate(clock.now()));
  const list = [];
  for (let m = month, i = 0; i < months; i += 1, m = previousMonth(m)) {
    const inMonth = rows.filter((r) => monthOf(r.payDate) === m);
    list.unshift({ month: m, totalDeductions: sum(inMonth, 'deductions'), totalSalary: sum(inMonth, 'basicSalary'), totalNetPay: sum(inMonth, 'netPay') });
  }
  return { points: list };
}

// ---- one record ----
async function ownedRecord(auth, id) {
  const row = await records.find(auth.accountId, id);
  const staff = row && await staffRepository.findById(auth.accountId, row.staffId);
  if (!row || !staff) throw notFound(MESSAGES.PAYROLL_NOT_FOUND);
  return { row, staff };
}

async function get(auth, id) {
  const { row, staff } = await ownedRecord(auth, id);
  const lk = await staffService.lookups(row.shopId);
  const today = localDate(clock.now());
  const month = monthOf(row.payDate);
  const e = await monthEntries(row.shopId, staff.id, month);
  const f = await figures(row);
  const history = (await records.list(row.shopId)).filter((r) => r.staffId === staff.id).sort((a, b) => b.payDate.localeCompare(a.payDate));
  return {
    ...(await dto(row, staff, lk, today)),
    financialSummary: { basicSalary: row.basicSalary, rewards: f.rewards, damages: f.deductions, estimatedSalary: f.netPay },
    rewardEntries: e.rewards.map((r) => ({ id: r.id, date: r.date, reason: r.reason, specificReason: r.specificReason, amount: r.amount })),
    deductionEntries: e.deductions.map((d) => ({ id: d.id, date: d.date, reason: d.reason, specificReason: d.specificReason, totalAmount: d.totalAmount, monthlyAmount: d.monthlyAmount })),
    paymentHistory: await Promise.all(history.map((r) => dto(r, staff, lk, today))),
  };
}

async function create(auth, { staffId, payDate, basicSalary }) {
  const staff = await staffService.owned(auth, staffId);
  const basic = basicSalary ?? staff.salary?.basic;
  if (basic === undefined || basic === null) throw conflict(MESSAGES.PAYROLL_NO_SALARY);
  if (await records.findByStaffMonth(staff.shopId, staff.id, monthOf(payDate))) throw conflict(MESSAGES.PAYROLL_EXISTS);
  const row = await records.create({ accountId: auth.accountId, shopId: staff.shopId, staffId: staff.id, payDate, basicSalary: basic, paidOn: null, snapshot: null });
  return dto(row, staff, await staffService.lookups(staff.shopId), localDate(clock.now()));
}

async function update(auth, id, { basicSalary, payDate }) {
  const { row, staff } = await ownedRecord(auth, id);
  if (row.paidOn) throw conflict(MESSAGES.PAYROLL_ALREADY_PAID);
  if (payDate && monthOf(payDate) !== monthOf(row.payDate) && await records.findByStaffMonth(row.shopId, staff.id, monthOf(payDate), row.id)) throw conflict(MESSAGES.PAYROLL_EXISTS);
  const saved = await records.update(row.id, { ...(basicSalary !== undefined && { basicSalary }), ...(payDate && { payDate }) });
  return dto(saved, staff, await staffService.lookups(row.shopId), localDate(clock.now()));
}

// Records the payment (PENDING APPROVAL: nothing is processed or sent) and freezes the amounts.
async function pay(auth, id) {
  const { row, staff } = await ownedRecord(auth, id);
  if (row.paidOn) throw conflict(MESSAGES.PAYROLL_ALREADY_PAID);
  const snapshot = await figures(row);
  const saved = await records.update(row.id, { paidOn: new Date(clock.now()).toISOString(), snapshot });
  return dto(saved, staff, await staffService.lookups(row.shopId), localDate(clock.now()));
}

module.exports = { list, exportCsv, summary, overview, get, create, update, pay, money };
