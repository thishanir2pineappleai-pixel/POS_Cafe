// Integration tests for shifts, the weekly roster and the staff-on-duty / active-shift summary.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { store } = require('../../repositories/memory/store');
const { bearer, makeRole, makeTeam, makeShift, seedStaff, setupAccounts } = require('./staffHelpers');
const { useTestServer } = require('./helpers');

const { ctx, api } = useTestServer();
const SH = '/api/v1/shifts';
let acc; let ref;

beforeEach(async () => {
  acc = await setupAccounts();
  ctx.token = acc.owner;
  ref = { roleId: (await makeRole(acc.shop1, 'Manager')).id, teamId: (await makeTeam(acc.shop1, 'Service')).id };
});

const as = (token, method, url, opts = {}) => api(method, url, { ...opts, headers: { ...bearer(token), ...opts.headers } });
const fieldsOf = (res) => (res.body.errors || []).map((e) => e.field);
const shiftBody = (over = {}) => ({ name: 'Morning', startTime: '06:00', endTime: '14:00', ...over });
const seed = (shiftId, over = {}) => seedStaff({ shopId: acc.shop1, ...ref, shiftId, ...over });

test('shifts: create, list with staff counts, update, turn off and on', async () => {
  assert.deepEqual((await as(acc.owner, 'GET', SH)).body.data, [], 'nothing is seeded');
  const made = await as(acc.admin, 'POST', SH, { json: { ...shiftBody(), shopId: acc.shop2, accountId: 2 } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const shift = made.body.data;
  assert.deepEqual({ name: shift.name, startTime: shift.startTime, endTime: shift.endTime, active: shift.active, staffCount: shift.staffCount },
    { name: 'Morning', startTime: '06:00', endTime: '14:00', active: true, staffCount: 0 });
  assert.equal(store.shifts.get(shift.id).shopId, acc.shop1, 'the shop comes from the account');

  await seed(shift.id); await seed(shift.id); await seed(shift.id, { active: false, inactiveReason: 'x' });
  assert.equal((await as(acc.owner, 'GET', SH)).body.data[0].staffCount, 2, 'only active staff are counted');

  const updated = await as(acc.admin, 'PUT', `${SH}/${shift.id}`, { json: { startTime: '05:30', endTime: '13:30' } });
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.data.startTime, '05:30');
  assert.equal(updated.body.data.name, 'Morning', 'the name stays when not sent');
  const off = await as(acc.admin, 'PUT', `${SH}/${shift.id}/status`, { json: { active: false } });
  assert.equal(off.body.data.active, false);
  assert.equal((await as(acc.admin, 'PUT', `${SH}/${shift.id}/status`, { json: { active: 'no' } })).status, 400);
  assert.equal((await as(acc.owner, 'PUT', `${SH}/${shift.id}/status`, { json: { active: true } })).body.data.active, true);
  assert.equal((await as(acc.other, 'PUT', `${SH}/${shift.id}`, { json: { startTime: '01:00', endTime: '02:00' } })).status, 404);
});

test('shifts: validation of times and names, duplicates, overnight shifts', async () => {
  for (const [over, field] of [[{ startTime: '6:00' }, 'startTime'], [{ startTime: '24:00' }, 'startTime'], [{ endTime: '14:60' }, 'endTime'],
    [{ endTime: '06:00' }, 'endTime'], [{ name: '' }, 'name'], [{ name: 'x'.repeat(51) }, 'name'], [{ active: 'yes' }, 'active']]) {
    const res = await as(acc.owner, 'POST', SH, { json: shiftBody(over) });
    assert.equal(res.status, 400, JSON.stringify(over));
    assert.ok(fieldsOf(res).includes(field), `${JSON.stringify(over)} -> ${fieldsOf(res)}`);
  }
  assert.equal((await as(acc.owner, 'POST', SH, { json: shiftBody() })).status, 201);
  assert.equal((await as(acc.owner, 'POST', SH, { json: shiftBody({ name: 'MORNING' }) })).status, 409);
  assert.equal((await as(acc.owner, 'POST', SH, { json: shiftBody({ name: 'Night', startTime: '22:00', endTime: '06:00' }) })).status, 201, 'the Figma Night shift runs past midnight');
  assert.equal((await as(acc.owner, 'POST', SH, { json: shiftBody({ name: 'Overlap', startTime: '07:00', endTime: '09:00' }) })).status, 201, 'overlapping times are allowed (rule pending)');
  assert.equal((await as(acc.owner, 'POST', `${SH}?shopId=${acc.shop3}`, { json: shiftBody({ name: 'Z' }) })).status, 404);
});

test('shifts: only the owner deletes, and never a shift that is in use', async () => {
  const shift = await makeShift(acc.shop1, 'Morning', '06:00', '14:00');
  const unused = await makeShift(acc.shop1, 'Unused', '14:00', '22:00');
  await seed(shift.id);
  assert.equal((await as(acc.admin, 'DELETE', `${SH}/${unused.id}`)).status, 403);
  assert.equal((await as(acc.owner, 'DELETE', `${SH}/${shift.id}`)).status, 409);
  assert.equal((await as(acc.owner, 'DELETE', `${SH}/${unused.id}`)).status, 200);
  assert.equal((await as(acc.owner, 'DELETE', `${SH}/${unused.id}`)).status, 404);
  assert.equal((await as(acc.other, 'DELETE', `${SH}/${shift.id}`)).status, 404);
});

test('roster: assign one day, the whole week, or the week without off days, and mark days off', async () => {
  const morning = await makeShift(acc.shop1, 'Morning', '06:00', '14:00');
  const evening = await makeShift(acc.shop1, 'Evening', '14:00', '22:00');
  const s = await seed(morning.id, { name: 'Michel' }); // mon-fri morning, sat/sun off
  const put = (json, id = s.id, token = acc.owner) => as(token, 'PUT', `${SH}/roster/${id}`, { json });

  let res = await put({ shiftId: evening.id, applyTo: 'day', day: 'WED' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.days.wed.name, 'Evening');
  assert.equal(res.body.data.days.tue.name, 'Morning');
  assert.deepEqual(res.body.data.days.sat, { type: 'off' });

  res = await put({ shiftId: evening.id, applyTo: 'week_without_off' });
  assert.equal(res.body.data.days.mon.name, 'Evening');
  assert.deepEqual(res.body.data.days.sun, { type: 'off' }, 'off days stay off');

  res = await put({ off: true, applyTo: 'day', day: 'fri' });
  assert.deepEqual(res.body.data.days.fri, { type: 'off' });

  res = await put({ shiftId: morning.id, applyTo: 'week' });
  for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) assert.equal(res.body.data.days[d].name, 'Morning', d);
  assert.deepEqual(store.roster.get(s.id).mon, morning.id, 'one value per day: a second shift replaces the first');
  assert.equal(res.body.data.days.mon.startTime, '06:00');
});

test('roster: validation, turned-off and foreign shifts, foreign staff', async () => {
  const morning = await makeShift(acc.shop1, 'Morning', '06:00', '14:00');
  const off = await makeShift(acc.shop1, 'Closed', '14:00', '22:00', { active: false });
  const otherShopShift = await makeShift(acc.shop2, 'Morning', '06:00', '14:00');
  const s = await seed(morning.id);
  const put = (json, id = s.id, token = acc.owner) => as(token, 'PUT', `${SH}/roster/${id}`, { json });
  for (const bad of [{}, { applyTo: 'week' }, { shiftId: morning.id }, { shiftId: morning.id, off: true, applyTo: 'week' },
    { shiftId: morning.id, applyTo: 'day' }, { shiftId: morning.id, applyTo: 'day', day: 'funday' }, { shiftId: morning.id, applyTo: 'sometimes' },
    { shiftId: 'abc', applyTo: 'week' }, { off: 'yes', applyTo: 'week' }]) {
    assert.equal((await put(bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal((await put({ shiftId: off.id, applyTo: 'week' })).status, 409, 'a turned-off shift cannot be assigned');
  assert.equal((await put({ shiftId: 99999, applyTo: 'week' })).status, 400);
  assert.equal((await put({ shiftId: otherShopShift.id, applyTo: 'week' })).status, 400, 'a shift of another shop');
  assert.equal((await put({ shiftId: morning.id, applyTo: 'week' }, 99999)).status, 404);
  assert.equal((await put({ shiftId: morning.id, applyTo: 'week' }, s.id, acc.other)).status, 404, 'another account');
});

test('roster: list, filters by shift, off and day, search, pagination, clearing', async () => {
  const morning = await makeShift(acc.shop1, 'Morning', '06:00', '14:00');
  const night = await makeShift(acc.shop1, 'Night', '22:00', '06:00');
  const a = await seed(morning.id, { name: 'Michel Brown', workingDays: ['mon', 'tue'] }); // sat/sun/wed.. off
  const b = await seed(night.id, { name: 'Sarah Jenkins', workingDays: ['thu'] });
  await seed(morning.id, { name: 'Gone', active: false, inactiveReason: 'x' });
  const list = async (qs = '') => (await as(acc.owner, 'GET', `${SH}/roster${qs}`)).body;
  const names = async (qs) => (await list(qs)).data.map((r) => r.staff.name);

  assert.deepEqual(await names(), ['Michel Brown', 'Sarah Jenkins'], 'inactive staff are not listed');
  assert.deepEqual(await names(`?shift=${night.id}`), ['Sarah Jenkins']);
  assert.deepEqual(await names(`?shift=${morning.id}&day=tue`), ['Michel Brown']);
  assert.deepEqual(await names(`?shift=${morning.id}&day=thu`), []);
  assert.deepEqual(await names('?shift=off&day=thu'), ['Michel Brown']);
  assert.deepEqual(await names('?day=thu'), ['Michel Brown', 'Sarah Jenkins'], 'a day alone: anyone with something on that day');
  assert.deepEqual(await names('?q=sarah'), ['Sarah Jenkins']);
  assert.deepEqual(await names(`?q=${b.code}`), ['Sarah Jenkins']);
  const page = await list('?limit=1&page=2');
  assert.deepEqual(page.meta, { total: 2, page: 2, limit: 1, totalPages: 2 });
  assert.equal(page.data[0].staff.name, 'Sarah Jenkins');
  for (const qs of ['?shift=abc', '?day=funday', '?page=0', '?limit=500', '?format=zip']) assert.equal((await as(acc.owner, 'GET', `${SH}/roster${qs}`)).status, 400, qs);

  assert.equal((await as(acc.owner, 'DELETE', `${SH}/roster/${a.id}?day=mon`)).status, 200);
  const cleared = (await list('?q=michel')).data[0];
  assert.equal(cleared.days.mon, null);
  assert.equal(cleared.days.tue.name, 'Morning');
  assert.equal((await as(acc.owner, 'DELETE', `${SH}/roster/${a.id}`)).status, 200);
  assert.ok(Object.values((await list('?q=michel')).data[0].days).every((c) => c === null));
  assert.equal((await as(acc.owner, 'DELETE', `${SH}/roster/${a.id}?day=zzz`)).status, 400);
  assert.equal((await as(acc.other, 'DELETE', `${SH}/roster/${b.id}`)).status, 404);
});

test('roster: CSV export is escaped, other formats are not implemented, an empty shop exports headers only', async () => {
  const morning = await makeShift(acc.shop1, 'Morning', '06:00', '14:00');
  await seed(morning.id, { name: '=HYPERLINK("http://evil")', workingDays: ['mon'] });
  const csv = await as(acc.owner, 'GET', `${SH}/roster/export?format=csv`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.headers.get('content-disposition'), /attachment/);
  assert.ok(csv.text.includes(`"'=HYPERLINK(""http://evil"")"`), 'spreadsheet formulas are neutralised');
  assert.ok(csv.text.includes('"MON"') && csv.text.includes('"Morning"') && csv.text.includes('"OFF"'));
  assert.equal((await as(acc.owner, 'GET', `${SH}/roster/export?format=pdf`)).status, 501);
  assert.equal((await as(acc.owner, 'GET', `${SH}/roster/export`)).status, 501, 'no format means not csv');
  const empty = await as(acc.owner, 'GET', `${SH}/roster/export?format=csv&shopId=${acc.shop2}`);
  assert.equal(empty.text.trim().split('\r\n').length, 1);
});

test('summary: active shift and staff on duty come from the shift times and the roster', async () => {
  // Two shifts that together cover every minute of the day, whatever time the test runs.
  const first = await makeShift(acc.shop1, 'Day', '00:00', '12:00');
  const second = await makeShift(acc.shop1, 'Evening', '12:00', '00:01'); // runs past midnight, covers 12:00 - 00:01
  const all = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  await seed(first.id, { workingDays: all }); await seed(first.id, { workingDays: all });
  await seed(second.id, { workingDays: all });
  await seed(second.id, { workingDays: all, active: false, inactiveReason: 'x' });
  const minutes = new Date().getHours() * 60 + new Date().getMinutes();
  const expected = minutes < 720 ? { shift: first, onDuty: 2 } : { shift: second, onDuty: 1 };
  const sum = (await as(acc.owner, 'GET', '/api/v1/staff/summary')).body.data;
  assert.equal(sum.activeShift.id, expected.shift.id);
  assert.equal(sum.activeShift.name, expected.shift.name);
  assert.equal(sum.staffOnDuty, expected.onDuty);
  assert.equal(sum.totalStaff, 4);
  assert.equal(sum.activeStaff, 3);
  // a turned-off shift is never "active"; with no shift covering now there is none and nobody is on duty
  await as(acc.owner, 'PUT', `${SH}/${first.id}/status`, { json: { active: false } });
  await as(acc.owner, 'PUT', `${SH}/${second.id}/status`, { json: { active: false } });
  const none = (await as(acc.owner, 'GET', '/api/v1/staff/summary')).body.data;
  assert.equal(none.activeShift, null);
  assert.equal(none.staffOnDuty, 0);
});

test('every shift route needs a signed-in user, and an account without a shop reads empty data', async () => {
  ctx.token = null;
  for (const [method, url] of [['GET', SH], ['POST', SH], ['PUT', `${SH}/1`], ['DELETE', `${SH}/1`], ['GET', `${SH}/roster`], ['PUT', `${SH}/roster/1`], ['GET', `${SH}/roster/export?format=csv`]]) {
    assert.equal((await api(method, url, method === 'GET' ? {} : { json: {} })).status, 401, `${method} ${url}`);
  }
  const { createUser, tokenFor } = require('./helpers');
  await createUser({ id: 9300, accountId: 3, role: 'owner', email: 'noshop@x.com' });
  const token = (await tokenFor(9300)).token;
  assert.deepEqual((await as(token, 'GET', SH)).body.data, []);
  const roster = await as(token, 'GET', `${SH}/roster`);
  assert.deepEqual(roster.body, { success: true, data: [], meta: { total: 0, page: 1, limit: 10, totalPages: 1 } });
  assert.equal((await as(token, 'POST', SH, { json: shiftBody() })).status, 409);
});
