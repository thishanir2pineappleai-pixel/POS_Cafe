// Integration tests for payroll (owner only): records, rewards, deductions, net pay, paying, summary cards, overview, exports.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { store } = require('../../repositories/memory/store');
const { bearer, makeRole, makeTeam, makeShift, seedStaff, setupAccounts } = require('./staffHelpers');
const { useTestServer } = require('./helpers');

const { ctx, api } = useTestServer();
const P = '/api/v1/payroll';
let acc; let ref;

beforeEach(async () => {
  acc = await setupAccounts();
  ctx.token = acc.owner;
  ref = {
    roleId: (await makeRole(acc.shop1, 'Manager')).id,
    teamId: (await makeTeam(acc.shop1, 'Service')).id,
    shiftId: (await makeShift(acc.shop1, 'Morning', '06:00', '14:00')).id,
  };
});

const as = (token, method, url, opts = {}) => api(method, url, { ...opts, headers: { ...bearer(token), ...opts.headers } });
const fieldsOf = (res) => (res.body.errors || []).map((e) => e.field);
const staff = (over = {}) => seedStaff({ shopId: acc.shop1, ...ref, ...over });
const salary = (basic) => ({ type: 'Monthly', basic, overtime: false, otRate: null, paymentMethod: 'Cash', bankName: null, accountNumber: null });
const record = async (staffId, payDate, extra = {}) => {
  const res = await as(acc.owner, 'POST', `${P}/records`, { json: { staffId, payDate, ...extra } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
};
const reward = async (staffId, date, amount, over = {}) => (await as(acc.owner, 'POST', `${P}/rewards`, { json: { staffId, date, reason: 'Performance Bonus', amount, ...over } })).body.data;
const deduction = async (staffId, date, totalAmount, monthlyAmount, over = {}) => (await as(acc.owner, 'POST', `${P}/deductions`, { json: { staffId, date, reason: 'Cash Shortage', totalAmount, monthlyAmount, ...over } })).body.data;

test('salary data is for the owner only: an admin gets 403 everywhere, no token 401, other accounts nothing', async () => {
  const s = await staff();
  const rec = await record(s.id, '2020-01-31');
  const urls = [['GET', `${P}/summary`], ['GET', `${P}/overview`], ['GET', `${P}/records`], ['GET', `${P}/records/${rec.id}`], ['POST', `${P}/records`], ['PUT', `${P}/records/${rec.id}`],
    ['POST', `${P}/records/${rec.id}/pay`], ['GET', `${P}/records/export?format=csv`], ['GET', `${P}/rewards`], ['POST', `${P}/rewards`], ['GET', `${P}/deductions`], ['POST', `${P}/deductions`], ['DELETE', `${P}/rewards/1`]];
  for (const [method, url] of urls) {
    const body = method === 'GET' || method === 'DELETE' ? {} : { json: {} };
    assert.equal((await as(acc.admin, method, url, body)).status, 403, `admin ${method} ${url}`);
  }
  ctx.token = null;
  for (const [method, url] of urls) assert.equal((await api(method, url, method === 'GET' || method === 'DELETE' ? {} : { json: {} })).status, 401, `anon ${method} ${url}`);
  assert.equal((await as(acc.other, 'GET', `${P}/records/${rec.id}`)).status, 404);
  assert.equal((await as(acc.other, 'POST', `${P}/records/${rec.id}/pay`)).status, 404);
  assert.equal((await as(acc.other, 'GET', `${P}/records`)).body.data.length, 0);
  assert.equal(store.payrollRecords.get(rec.id).paidOn, null);
  assert.equal((await as(acc.owner, 'GET', `${P}/records`)).headers.get('cache-control'), 'no-store');
});

test('a record: salary comes from the staff record, one per staff and month, validated', async () => {
  const s = await staff({ salary: salary(45000) });
  const rec = await record(s.id, '2020-01-31');
  assert.equal(rec.basicSalary, 45000);
  assert.equal(rec.status, 'Overdue');
  assert.equal(rec.netPay, 45000);
  assert.deepEqual(rec.staff, { id: s.id, code: s.code, name: s.name, image: null, role: { id: ref.roleId, name: 'Manager' } });
  assert.equal((await as(acc.owner, 'POST', `${P}/records`, { json: { staffId: s.id, payDate: '2020-01-05' } })).status, 409, 'same month');
  assert.equal((await record(s.id, '2020-02-29', { basicSalary: 50000 })).basicSalary, 50000, 'an explicit salary wins');
  const noSalary = await staff({ salary: null });
  assert.equal((await as(acc.owner, 'POST', `${P}/records`, { json: { staffId: noSalary.id, payDate: '2020-01-31' } })).status, 409);
  assert.equal((await record(noSalary.id, '2020-01-31', { basicSalary: 1000 })).basicSalary, 1000);
  for (const [json, field] of [[{ staffId: s.id }, 'payDate'], [{ payDate: '2020-03-31' }, 'staffId'], [{ staffId: s.id, payDate: '31.03.2020' }, 'payDate'],
    [{ staffId: s.id, payDate: '2020-03-31', basicSalary: 0 }, 'basicSalary'], [{ staffId: s.id, payDate: '2020-03-31', basicSalary: '1,000.00' }, 'basicSalary']]) {
    const res = await as(acc.owner, 'POST', `${P}/records`, { json });
    assert.equal(res.status, 400, JSON.stringify(json));
    assert.ok(fieldsOf(res).includes(field));
  }
  assert.equal((await as(acc.owner, 'POST', `${P}/records`, { json: { staffId: 99999, payDate: '2020-03-31' } })).status, 404);
  assert.equal((await as(acc.other, 'POST', `${P}/records`, { json: { staffId: s.id, payDate: '2020-03-31' } })).status, 404);
});

test('net pay = basic salary + rewards - monthly deductions of the pay month (the Figma example: 49,000)', async () => {
  const s = await staff({ salary: salary(45000) });
  const other = await staff({ salary: salary(45000) });
  const rec = await record(s.id, '2020-01-31');
  await reward(s.id, '2020-01-10', 12000);
  await reward(s.id, '2020-02-10', 999); // another month
  await reward(other.id, '2020-01-10', 777); // another staff member
  await deduction(s.id, '2020-01-12', 20000, 8000);
  const d = (await as(acc.owner, 'GET', `${P}/records/${rec.id}`)).body.data;
  assert.equal(d.rewards, 12000);
  assert.equal(d.deductions, 8000);
  assert.equal(d.netPay, 49000);
  assert.deepEqual(d.financialSummary, { basicSalary: 45000, rewards: 12000, damages: 8000, estimatedSalary: 49000 });
  assert.equal(d.rewardEntries.length, 1);
  assert.equal(d.deductionEntries[0].totalAmount, 20000);
  assert.equal(d.paymentHistory.length, 1);
});

test('rewards and deductions: create, validate, list, edit, delete', async () => {
  const s = await staff();
  const r = await reward(s.id, '2020-01-10', 500);
  assert.equal(r.reason, 'Performance Bonus');
  const other = await as(acc.owner, 'POST', `${P}/rewards`, { json: { staffId: s.id, date: '2020-01-11', reason: 'Other', specificReason: 'Festival Bonus', amount: 500.5 } });
  assert.equal(other.status, 201, JSON.stringify(other.body));
  assert.equal(other.body.data.specificReason, 'Festival Bonus');
  for (const [json, field] of [[{ reason: 'Other', amount: 5 }, 'specificReason'], [{ reason: 'Free Money', amount: 5 }, 'reason'], [{ reason: 'Performance Bonus', amount: 0 }, 'amount'],
    [{ reason: 'Performance Bonus', amount: -5 }, 'amount'], [{ reason: 'Performance Bonus', amount: 5.123 }, 'amount'], [{ reason: 'Performance Bonus' }, 'amount']]) {
    const res = await as(acc.owner, 'POST', `${P}/rewards`, { json: { staffId: s.id, date: '2020-01-10', ...json } });
    assert.equal(res.status, 400, JSON.stringify(json));
    assert.ok(fieldsOf(res).includes(field), `${JSON.stringify(json)} -> ${fieldsOf(res)}`);
  }
  const bad = await as(acc.owner, 'POST', `${P}/deductions`, { json: { staffId: s.id, date: '2020-01-10', reason: 'Cash Shortage', totalAmount: 1000, monthlyAmount: 2000 } });
  assert.equal(bad.status, 400);
  assert.ok(fieldsOf(bad).includes('monthlyAmount'));
  const ded = await deduction(s.id, '2020-01-10', 12000, 1000, { reason: 'Damaged Item / Equipment' });
  assert.equal(ded.monthlyAmount, 1000);

  assert.equal((await as(acc.owner, 'GET', `${P}/rewards`)).body.data.length, 2);
  assert.equal((await as(acc.owner, 'GET', `${P}/rewards?date=2020-01-11`)).body.data.length, 1);
  assert.equal((await as(acc.owner, 'GET', `${P}/rewards?staffId=99`)).body.data.length, 0);
  assert.equal((await as(acc.owner, 'GET', `${P}/rewards?limit=1`)).body.meta.total, 2);
  assert.equal((await as(acc.owner, 'GET', `${P}/deductions`)).body.data.length, 1);
  for (const qs of ['date=2020-13-01', 'staffId=x', 'page=0', 'format=zip']) assert.equal((await as(acc.owner, 'GET', `${P}/rewards?${qs}`)).status, 400, qs);

  const edited = await as(acc.owner, 'PUT', `${P}/rewards/${r.id}`, { json: { staffId: s.id, date: '2020-01-10', reason: 'Perfect Attendance', amount: 750 } });
  assert.equal(edited.body.data.amount, 750);
  assert.equal((await as(acc.owner, 'PUT', `${P}/rewards/99999`, { json: { staffId: s.id, date: '2020-01-10', reason: 'Perfect Attendance', amount: 1 } })).status, 404);
  assert.equal((await as(acc.owner, 'GET', `${P}/rewards/${r.id}`)).body.data.reason, 'Perfect Attendance');
  assert.equal((await as(acc.owner, 'DELETE', `${P}/rewards/${r.id}`)).status, 200);
  assert.equal((await as(acc.owner, 'GET', `${P}/rewards/${r.id}`)).status, 404);
  assert.equal((await as(acc.other, 'DELETE', `${P}/deductions/${ded.id}`)).status, 404);
  assert.equal((await as(acc.owner, 'DELETE', `${P}/deductions/${ded.id}`)).status, 200);
  assert.equal((await as(acc.owner, 'GET', `${P}/rewards/csv`)).status, 400, 'a non-numeric id');
});

test('paying: marks the record paid once, freezes the amounts, and blocks edits', async () => {
  const s = await staff({ salary: salary(45000) });
  const rec = await record(s.id, '2020-01-31');
  await reward(s.id, '2020-01-10', 12000);
  const edit = await as(acc.owner, 'PUT', `${P}/records/${rec.id}`, { json: { basicSalary: 46000, payDate: '2020-01-30' } });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.equal(edit.body.data.netPay, 58000);
  assert.equal((await as(acc.owner, 'PUT', `${P}/records/${rec.id}`, { json: {} })).status, 400);
  assert.equal((await as(acc.owner, 'PUT', `${P}/records/${rec.id}`, { json: { basicSalary: 'free' } })).status, 400);

  const paid = await as(acc.owner, 'POST', `${P}/records/${rec.id}/pay`);
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.equal(paid.body.data.status, 'Paid');
  assert.ok(paid.body.data.paidOn);
  assert.equal(paid.body.data.netPay, 58000);
  assert.equal((await as(acc.owner, 'POST', `${P}/records/${rec.id}/pay`)).status, 409, 'cannot pay twice');
  assert.equal((await as(acc.owner, 'PUT', `${P}/records/${rec.id}`, { json: { basicSalary: 1 } })).status, 409);

  await reward(s.id, '2020-01-20', 5000); // added after paying
  assert.equal((await as(acc.owner, 'GET', `${P}/records/${rec.id}`)).body.data.netPay, 58000, 'a paid record is frozen');
  assert.equal((await as(acc.owner, 'POST', `${P}/records/99999/pay`)).status, 404);
});

test('records: list with status, month, role and search filters; Pending / Overdue / Paid', async () => {
  const chef = await makeRole(acc.shop1, 'Chef');
  const a = await staff({ name: 'Anna Overdue', salary: salary(1000) });
  const b = await staff({ name: 'Ben Pending', salary: salary(2000), roleId: chef.id });
  const c = await staff({ name: 'Cara Paid', salary: salary(3000) });
  await record(a.id, '2020-01-31');
  await record(b.id, '2099-12-31');
  const rc = await record(c.id, '2020-01-15');
  await as(acc.owner, 'POST', `${P}/records/${rc.id}/pay`);
  const names = async (qs) => (await as(acc.owner, 'GET', `${P}/records?${qs}`)).body.data.map((r) => `${r.staff.name}:${r.status}`);
  assert.deepEqual(await names(''), ['Ben Pending:Pending', 'Anna Overdue:Overdue', 'Cara Paid:Paid'], 'latest pay date first');
  assert.deepEqual(await names('status=Overdue'), ['Anna Overdue:Overdue']);
  assert.deepEqual(await names('status=Paid'), ['Cara Paid:Paid']);
  assert.deepEqual(await names('month=2099-12'), ['Ben Pending:Pending']);
  assert.deepEqual(await names(`roleId=${chef.id}`), ['Ben Pending:Pending']);
  assert.deepEqual(await names('q=cara'), ['Cara Paid:Paid']);
  assert.deepEqual(await names(`q=${a.code}`), ['Anna Overdue:Overdue']);
  assert.equal((await as(acc.owner, 'GET', `${P}/records?limit=2&page=2`)).body.data.length, 1);
  for (const qs of ['status=Maybe', 'month=2020-13', 'month=2020', 'roleId=x', 'limit=0']) assert.equal((await as(acc.owner, 'GET', `${P}/records?${qs}`)).status, 400, qs);
  assert.equal((await as(acc.owner, 'GET', `${P}/records?shopId=${acc.shop2}`)).body.data.length, 0);
  assert.equal((await as(acc.owner, 'GET', `${P}/records?shopId=${acc.shop3}`)).status, 404);
});

test('summary cards, status counts, upcoming payroll and the overview chart come from the records', async () => {
  const empty = (await as(acc.owner, 'GET', `${P}/summary?month=2020-01`)).body.data;
  assert.deepEqual(empty.totalBasicSalary, { value: 0, changePercent: null });
  assert.deepEqual(empty.upcomingPayroll, { nextPayDate: null, daysRemaining: null });
  assert.deepEqual(empty.payrollStatus, { overdue: 0, pending: 0, paid: 0 });
  assert.deepEqual((await as(acc.owner, 'GET', `${P}/overview?month=2020-01&months=2`)).body.data.points.map((p) => p.totalSalary), [0, 0]);

  const a = await staff({ salary: salary(45000) });
  const b = await staff({ salary: salary(40000) });
  const c = await staff({ salary: salary(10000) });
  await record(a.id, '2020-01-31');
  await record(b.id, '2019-12-31');
  await record(c.id, '2099-12-31');
  await reward(a.id, '2020-01-10', 12000);
  await deduction(a.id, '2020-01-12', 8000, 8000);
  const sum = (await as(acc.owner, 'GET', `${P}/summary?month=2020-01`)).body.data;
  assert.deepEqual(sum.totalBasicSalary, { value: 45000, changePercent: 12.5 }, 'versus the month before');
  assert.deepEqual(sum.totalReward, { value: 12000, changePercent: null }, 'nothing to compare with');
  assert.deepEqual(sum.totalDeductions, { value: 8000, changePercent: null });
  assert.deepEqual(sum.totalNetCost, { value: 49000, changePercent: 22.5 });
  assert.equal(sum.upcomingPayroll.nextPayDate, '2099-12-31');
  assert.ok(sum.upcomingPayroll.daysRemaining > 0);
  assert.deepEqual(sum.payrollStatus, { overdue: 2, pending: 1, paid: 0 });
  assert.equal((await as(acc.owner, 'GET', `${P}/summary?month=2020`)).status, 400);
  assert.equal((await as(acc.owner, 'GET', `${P}/summary?months=13&month=2020-01`)).status, 400);

  const chart = (await as(acc.owner, 'GET', `${P}/overview?month=2020-01&months=3`)).body.data.points;
  assert.deepEqual(chart.map((p) => p.month), ['2019-11', '2019-12', '2020-01']);
  assert.deepEqual(chart.map((p) => p.totalSalary), [0, 40000, 45000]);
  assert.deepEqual(chart[2], { month: '2020-01', totalDeductions: 8000, totalSalary: 45000, totalNetPay: 49000 });
});

test('CSV export is escaped; PDF and XLS are not implemented', async () => {
  const s = await staff({ name: '=cmd|calc', salary: salary(45000) });
  await record(s.id, '2020-01-31');
  const csv = await as(acc.owner, 'GET', `${P}/records/export?format=csv`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.ok(csv.text.includes(`"'=cmd|calc"`));
  assert.ok(csv.text.includes('"Net Pay"'));
  assert.equal((await as(acc.owner, 'GET', `${P}/records/export?format=pdf`)).status, 501);
  assert.equal((await as(acc.owner, 'GET', `${P}/rewards/export?format=csv`)).status, 200);
  assert.equal((await as(acc.owner, 'GET', `${P}/deductions/export?format=csv`)).status, 200);
});
