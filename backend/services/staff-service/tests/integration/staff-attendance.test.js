// Integration tests for attendance (check-in/out, daily rows, statuses, summary) and leave management.
// The test moves the shared clock (shared/clock.js) to 10:30 today so Late / On Time / Absent are predictable.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const clock = require('@pos-cafe/shared/clock');
const { localDate } = require('@pos-cafe/shared/date');
const { store } = require('../../repositories/memory/store');
const { bearer, makeRole, makeTeam, makeShift, seedStaff, setupAccounts } = require('./staffHelpers');
const { useTestServer } = require('./helpers');

const { ctx, api } = useTestServer();
const AT = '/api/v1/attendance';
const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
let acc; let ref; let today;

function setTime(hour, minute) {
  const t = new Date();
  t.setHours(hour, minute, 0, 0);
  clock.advance(t.getTime() - clock.now());
}

beforeEach(async () => {
  setTime(10, 30); // first, so the sessions below are issued at the moved time; they last two days, tests move the clock by hours
  acc = await setupAccounts({ ttlSeconds: 2 * 24 * 3600 });
  ctx.token = acc.owner;
  ref = { roleId: (await makeRole(acc.shop1, 'Waiter')).id, teamId: (await makeTeam(acc.shop1, 'Service')).id };
  today = localDate(clock.now());
  shiftsByStart = new Map();
});

const as = (token, method, url, opts = {}) => api(method, url, { ...opts, headers: { ...bearer(token), ...opts.headers } });
const fieldsOf = (res) => (res.body.errors || []).map((e) => e.field);
let shiftsByStart;
const staffAt = async (start, over = {}) => {
  if (!shiftsByStart.has(start)) shiftsByStart.set(start, await makeShift(acc.shop1, `Shift ${start}`, start, '23:00')); // shift names are unique
  const shift = shiftsByStart.get(start);
  return seedStaff({ shopId: acc.shop1, ...ref, shiftId: shift.id, workingDays: ALL_DAYS, ...over });
};
const checkIn = (staffId, token = acc.owner) => as(token, 'POST', `${AT}/check-in`, { json: { staffId } });
const checkOut = (staffId, token = acc.owner) => as(token, 'POST', `${AT}/check-out`, { json: { staffId } });
const rows = async (qs = '') => (await as(acc.owner, 'GET', `${AT}?${qs}`)).body;

test('check-in and check-out: server time, once a day, in order', async () => {
  const s = await staffAt('09:00');
  assert.equal((await checkOut(s.id)).status, 409, 'cannot check out before checking in');
  const res = await as(acc.owner, 'POST', `${AT}/check-in`, { json: { staffId: s.id, time: '03:00', checkInAt: '2000-01-01T03:00:00', date: '2000-01-01' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.checkIn, '10:30', 'client times are ignored');
  assert.equal(res.body.data.date, today);
  assert.equal(res.body.data.checkOut, null);
  assert.equal((await checkIn(s.id)).status, 409, 'a second check-in the same day');
  clock.advance(7 * 3600 * 1000);
  const out = await checkOut(s.id);
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.equal(out.body.data.checkOut, '17:30');
  assert.deepEqual(out.body.data.timeline.map((e) => e.type), ['check_in', 'check_out']);
  assert.equal((await checkOut(s.id)).status, 409, 'a second check-out');
  assert.equal(store.attendance.size, 1);
});

test('check-in rules: validation, inactive staff, unknown and other-account staff, admins may record', async () => {
  const s = await staffAt('09:00');
  const inactive = await staffAt('09:00', { active: false, inactiveReason: 'x' });
  for (const body of [{}, { staffId: 'abc' }, { staffId: 0 }, []]) assert.equal((await as(acc.owner, 'POST', `${AT}/check-in`, { json: body })).status, 400, JSON.stringify(body));
  assert.equal((await checkIn(inactive.id)).status, 409);
  assert.equal((await checkIn(99999)).status, 404);
  assert.equal((await checkIn(s.id, acc.other)).status, 404, 'another account');
  assert.equal((await checkIn(s.id, acc.admin)).status, 201, 'an admin may add attendance');
  ctx.token = null;
  assert.equal((await api('POST', `${AT}/check-in`, { json: { staffId: s.id } })).status, 401);
});

test('daily rows: Late, On Time, Absent, and staff whose shift has not started are not listed', async () => {
  const late = await staffAt('09:00', { name: 'Late Larry' });
  const onTime = await staffAt('10:30', { name: 'Exact Eve' }); // starts at 10:30, checks in at 10:30: not later than the start
  const absent = await staffAt('08:00', { name: 'Absent Abe' });
  await staffAt('11:00', { name: 'Not Yet' });
  await staffAt('08:00', { name: 'Inactive Ian', active: false, inactiveReason: 'x' });
  await checkIn(late.id); await checkIn(onTime.id);

  const body = await rows();
  const byName = Object.fromEntries(body.data.map((r) => [r.staff.name, r]));
  assert.deepEqual(Object.keys(byName).sort(), ['Absent Abe', 'Exact Eve', 'Late Larry']);
  assert.equal(byName['Late Larry'].status, 'Late');
  assert.equal(byName['Late Larry'].checkIn, '10:30');
  assert.equal(byName['Exact Eve'].status, 'On Time');
  assert.equal(byName['Absent Abe'].status, 'Absent');
  assert.equal(byName['Absent Abe'].checkIn, null);
  assert.equal(byName['Late Larry'].staff.role.name, 'Waiter');
  assert.ok(!('_hasRecord' in byName['Late Larry']));
  assert.deepEqual(body.meta, { total: 3, page: 1, limit: 10, totalPages: 1 });

  const summary = (await as(acc.owner, 'GET', `${AT}/summary`)).body.data;
  assert.deepEqual(summary, { date: today, totalStaff: 4, present: 2, late: 1, absent: 1, leave: 0 });
  void absent;
});

test('daily rows: filters by status, staff, role and search; pagination', async () => {
  const a = await staffAt('09:00', { name: 'Anna Late' });
  await staffAt('08:00', { name: 'Ben Absent' });
  const chef = await makeRole(acc.shop1, 'Chef');
  await staffAt('08:00', { name: 'Cara Chef', roleId: chef.id });
  await checkIn(a.id);
  const names = async (qs) => (await rows(qs)).data.map((r) => r.staff.name).sort();
  assert.deepEqual(await names('status=Late'), ['Anna Late']);
  assert.deepEqual(await names('status=Absent'), ['Ben Absent', 'Cara Chef']);
  assert.deepEqual(await names(`roleId=${chef.id}`), ['Cara Chef']);
  assert.deepEqual(await names(`staffId=${a.id}`), ['Anna Late']);
  assert.deepEqual(await names('q=ben'), ['Ben Absent']);
  assert.deepEqual(await names(`q=${a.code}`), ['Anna Late']);
  assert.deepEqual((await rows('limit=2&page=2')).data.length, 1);
  for (const qs of ['date=2026-02-30', 'date=today', 'status=Sleeping', 'roleId=abc', 'staffId=0', 'page=0', 'format=zip']) assert.equal((await as(acc.owner, 'GET', `${AT}?${qs}`)).status, 400, qs);
});

test('past and future dates: rostered staff were absent in the past, nothing is expected in the future', async () => {
  await staffAt('08:00'); await staffAt('09:00');
  const past = await rows('date=2021-01-04');
  assert.equal(past.data.length, 2);
  assert.ok(past.data.every((r) => r.status === 'Absent' && r.date === '2021-01-04'));
  assert.equal((await rows('date=2099-01-01')).data.length, 0);
  assert.equal((await rows('date=2019-01-01')).data.length, 0, 'before the join date');
  const summary = (await as(acc.owner, 'GET', `${AT}/summary?date=2021-01-04`)).body.data;
  assert.deepEqual(summary, { date: '2021-01-04', totalStaff: 2, present: 0, late: 0, absent: 2, leave: 0 });
});

test('attendance of one staff member: details and timeline, 404 when nothing happened', async () => {
  const s = await staffAt('09:00');
  assert.equal((await as(acc.owner, 'GET', `${AT}/staff/${s.id}`)).status, 404);
  await checkIn(s.id);
  await as(acc.owner, 'POST', `${AT}/leaves`, { json: { staffId: s.id, type: 'hour_permission', date: today, startTime: '13:00', endTime: '14:00', reason: 'Personal Work' } });
  clock.advance(7 * 3600 * 1000);
  await checkOut(s.id);
  const d = (await as(acc.owner, 'GET', `${AT}/staff/${s.id}?date=${today}`)).body.data;
  assert.equal(d.status, 'Hour Permission');
  assert.deepEqual(d.timeline, [{ type: 'check_in', time: '10:30' }, { type: 'hour_permission', time: '13:00' }, { type: 'returned', time: '14:00' }, { type: 'check_out', time: '17:30' }]);
  assert.equal(d.leave.durationHours, 1);
  assert.equal((await as(acc.other, 'GET', `${AT}/staff/${s.id}`)).status, 404);
  assert.equal((await as(acc.owner, 'GET', `${AT}/staff/abc`)).status, 400);
});

const leaveBody = (staffId, over = {}) => ({ staffId, type: 'hour_permission', date: '2026-05-02', startTime: '12:00', endTime: '13:00', reason: 'Personal', ...over });

test('leave: hour permission, half day and full day, validated by type', async () => {
  const s = await staffAt('09:00');
  const post = (json, token = acc.owner) => as(token, 'POST', `${AT}/leaves`, { json });
  const hour = await post(leaveBody(s.id));
  assert.equal(hour.status, 201, JSON.stringify(hour.body));
  assert.equal(hour.body.data.typeLabel, 'Hour Permission');
  assert.equal(hour.body.data.durationHours, 1);
  const half = await post(leaveBody(s.id, { type: 'half_day', date: '2026-05-03', half: 'second', startTime: undefined, endTime: undefined }));
  assert.equal(half.status, 201, JSON.stringify(half.body));
  assert.equal(half.body.data.half, 'second');
  assert.equal(half.body.data.startTime, null);
  assert.equal(half.body.data.durationHours, null, 'half-day hours are not defined');
  const full = await post(leaveBody(s.id, { type: 'full_day', date: '2026-05-04', startTime: '01:00', half: 'first' }));
  assert.equal(full.status, 201);
  assert.equal(full.body.data.startTime, null, 'a full day stores no times');
  assert.equal(full.body.data.half, null);

  for (const [over, field] of [[{ startTime: '13:00', endTime: '12:00' }, 'endTime'], [{ startTime: '25:00' }, 'startTime'], [{ type: 'half_day' }, 'half'],
    [{ type: 'sabbatical' }, 'type'], [{ date: '2026-02-30', staffId: s.id }, 'date'], [{ reason: '' }, 'reason'], [{ staffId: undefined }, 'staffId']]) {
    const res = await post(leaveBody(s.id, { date: '2026-06-01', ...over }));
    assert.equal(res.status, 400, JSON.stringify(over));
    assert.ok(fieldsOf(res).includes(field), `${JSON.stringify(over)} -> ${fieldsOf(res)}`);
  }
  const dup = await post(leaveBody(s.id));
  assert.equal(dup.status, 409, 'one leave per staff member and date');
  assert.equal((await post(leaveBody(99999))).status, 404);
  assert.equal((await post(leaveBody(s.id, { date: '2026-07-01' }), acc.other)).status, 404, 'another account');
  assert.equal(store.leaves.size, 3);
});

test('leave: list, filters, summary cards, view, update, delete (owner only), export', async () => {
  const a = await staffAt('09:00', { name: 'Anna' });
  const b = await staffAt('09:00', { name: 'Ben' });
  const mk = async (json) => (await as(acc.owner, 'POST', `${AT}/leaves`, { json })).body.data;
  const l1 = await mk(leaveBody(a.id, { date: '2026-05-02' }));
  await mk(leaveBody(a.id, { type: 'half_day', half: 'first', date: '2026-05-03' }));
  await mk(leaveBody(b.id, { type: 'full_day', date: '2026-05-04' }));
  const list = async (qs = '') => (await as(acc.owner, 'GET', `${AT}/leaves?${qs}`)).body;

  const all = await list();
  assert.equal(all.data.length, 3);
  assert.deepEqual(all.data.map((l) => l.date), ['2026-05-04', '2026-05-03', '2026-05-02'], 'newest date first');
  assert.deepEqual((await list('type=full_day')).data.map((l) => l.staff.name), ['Ben']);
  assert.deepEqual((await list(`staffId=${a.id}`)).data.length, 2);
  assert.deepEqual((await list('date=2026-05-03')).data.length, 1);
  assert.deepEqual((await list('q=ben')).data.length, 1);
  assert.deepEqual((await list('limit=2&page=2')).meta, { total: 3, page: 2, limit: 2, totalPages: 2 });
  for (const qs of ['type=nope', 'date=bad', 'staffId=x', 'page=0']) assert.equal((await as(acc.owner, 'GET', `${AT}/leaves?${qs}`)).status, 400, qs);

  assert.deepEqual((await as(acc.owner, 'GET', `${AT}/leaves/summary`)).body.data, { totalLeave: 3, hourPermission: 1, halfDay: 1, fullDay: 1 });
  assert.equal((await as(acc.owner, 'GET', `${AT}/leaves/${l1.id}`)).body.data.reason, 'Personal');
  assert.equal((await as(acc.other, 'GET', `${AT}/leaves/${l1.id}`)).status, 404);

  const edit = await as(acc.admin, 'PUT', `${AT}/leaves/${l1.id}`, { json: leaveBody(a.id, { date: '2026-05-02', type: 'full_day', reason: 'Sick' }) });
  assert.equal(edit.status, 200, JSON.stringify(edit.body));
  assert.equal(edit.body.data.typeLabel, 'Full Day');
  assert.equal(edit.body.data.startTime, null);
  const clash = await as(acc.owner, 'PUT', `${AT}/leaves/${l1.id}`, { json: leaveBody(a.id, { date: '2026-05-03' }) });
  assert.equal(clash.status, 409);
  assert.equal((await as(acc.owner, 'PUT', `${AT}/leaves/99999`, { json: leaveBody(a.id) })).status, 404);

  const csv = await as(acc.owner, 'GET', `${AT}/leaves/export?format=csv`);
  assert.equal(csv.status, 200);
  assert.ok(csv.text.includes('"Anna"') && csv.text.includes('"Full Day"'));
  assert.equal((await as(acc.owner, 'GET', `${AT}/leaves/export?format=pdf`)).status, 501);

  assert.equal((await as(acc.admin, 'DELETE', `${AT}/leaves/${l1.id}`)).status, 403);
  assert.equal((await as(acc.other, 'DELETE', `${AT}/leaves/${l1.id}`)).status, 404);
  assert.equal((await as(acc.owner, 'DELETE', `${AT}/leaves/${l1.id}`)).status, 200);
  assert.equal((await as(acc.owner, 'DELETE', `${AT}/leaves/${l1.id}`)).status, 404);
});

test('a leave decides the day status and the Leave card; CSV export of attendance', async () => {
  const s = await staffAt('09:00', { name: 'Anna' });
  const t = await staffAt('08:00', { name: 'Ben' });
  await checkIn(s.id);
  await as(acc.owner, 'POST', `${AT}/leaves`, { json: leaveBody(s.id, { type: 'half_day', half: 'second', date: today }) });
  await as(acc.owner, 'POST', `${AT}/leaves`, { json: leaveBody(t.id, { type: 'full_day', date: today }) });
  const byName = Object.fromEntries((await rows()).data.map((r) => [r.staff.name, r]));
  assert.equal(byName.Anna.status, 'Half Day Leave');
  assert.equal(byName.Ben.status, 'Full Day Leave');
  assert.equal(byName.Ben.leaveType, 'full_day');
  const summary = (await as(acc.owner, 'GET', `${AT}/summary`)).body.data;
  assert.equal(summary.leave, 2);
  assert.equal(summary.absent, 0, 'someone on leave is not absent');
  assert.equal(summary.present, 1);
  const csv = await as(acc.owner, 'GET', `${AT}/export?format=csv`);
  assert.equal(csv.status, 200);
  assert.ok(csv.text.includes('"Half Day Leave"') && csv.text.includes(`"${today}"`));
  assert.equal((await as(acc.owner, 'GET', `${AT}/export?format=xls`)).status, 501);
});

test('attendance and leave are shop-scoped and need a signed-in user; empty shops read empty data', async () => {
  const s = await staffAt('08:00');
  assert.equal((await as(acc.owner, 'GET', `${AT}?shopId=${acc.shop2}`)).body.data.length, 0);
  assert.equal((await as(acc.owner, 'GET', `${AT}?shopId=${acc.shop3}`)).status, 404);
  assert.deepEqual((await as(acc.owner, 'GET', `${AT}/summary?shopId=${acc.shop2}`)).body.data, { date: today, totalStaff: 0, present: 0, late: 0, absent: 0, leave: 0 });
  assert.deepEqual((await as(acc.owner, 'GET', `${AT}/leaves/summary?shopId=${acc.shop2}`)).body.data, { totalLeave: 0, hourPermission: 0, halfDay: 0, fullDay: 0 });
  assert.equal((await as(acc.other, 'GET', AT)).body.data.length, 0, "another account never sees this shop's staff");
  void s;
  ctx.token = null;
  for (const [method, url] of [['GET', AT], ['GET', `${AT}/summary`], ['POST', `${AT}/check-in`], ['POST', `${AT}/check-out`], ['GET', `${AT}/leaves`], ['POST', `${AT}/leaves`], ['GET', `${AT}/staff/1`]]) {
    assert.equal((await api(method, url, method === 'GET' ? {} : { json: {} })).status, 401, `${method} ${url}`);
  }
});
