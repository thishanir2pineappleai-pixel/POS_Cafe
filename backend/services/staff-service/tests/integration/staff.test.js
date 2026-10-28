// Integration tests for the Staff Management staff API: create + validation, duplicates, list/search/filters/pagination,
// summary, view, edit, status, removal/restore, shop and account isolation, owner/admin permissions, picture and document
// uploads. Real Express app on a random 127.0.0.1 port, in-memory repositories (MySQL is not configured), no sample data.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const clock = require('@pos-cafe/shared/clock');
const { store } = require('../../repositories/memory/store');
const { uploads } = require('../../config');
const { createUser, tokenFor, useTestServer } = require('./helpers');
const {
  OWNER, bearer, makeRole, makeTeam, makeShift, seedStaff, setupAccounts, staffBody, PNG, PDF, multipart,
} = require('./staffHelpers');

const { ctx, api } = useTestServer();
const S = '/api/v1/staff';
let acc; let ref; // tokens/shops, and { roleId, teamId, shiftId } of a ready role, team and shift in shop 1
const touched = new Set();

beforeEach(async () => {
  acc = await setupAccounts();
  ctx.token = acc.owner;
  const role = await makeRole(acc.shop1, 'Manager');
  const team = await makeTeam(acc.shop1, 'Service');
  const shift = await makeShift(acc.shop1, 'Morning', '06:00', '14:00');
  ref = { roleId: role.id, teamId: team.id, shiftId: shift.id };
});

after(() => {
  for (const f of touched) {
    fs.rmSync(path.join(uploads.staffDir, f), { force: true });
    fs.rmSync(path.join(uploads.staffDocumentsDir, f), { force: true });
  }
  for (const dir of [uploads.staffDir, uploads.staffDocumentsDir]) { try { fs.rmdirSync(dir); } catch { /* not empty or missing: fine */ } }
});

const as = (token, method, url, opts = {}) => api(method, url, { ...opts, headers: { ...bearer(token), ...opts.headers } });
const fieldsOf = (res) => (res.body.errors || []).map((e) => e.field);
const create = async (over, token = acc.owner, query = '') => as(token, 'POST', `${S}${query}`, { json: staffBody(ref, over) });
const made = async (over) => { const r = await create(over); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.data; };
const seed = (over = {}) => seedStaff({ shopId: acc.shop1, ...ref, ...over });
const track = () => { for (const s of store.staff.values()) { if (s.imagePath) touched.add(s.imagePath); for (const d of Object.values(s.documents)) if (d) touched.add(d.storedName); } };

test('creates a staff member with a server-made code, normalized values and a safe response', async () => {
  const res = await create();
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const d = res.body.data;
  assert.equal(d.code, 'STF0001');
  assert.equal(d.email, 'kumari.perera@paipos.com'); // lower-cased
  assert.equal(d.nic, '199612345678'); // spaces removed
  assert.equal(d.phone, '071 555 1234');
  assert.deepEqual(d.role, { id: ref.roleId, name: 'Manager' });
  assert.deepEqual(d.team, { id: ref.teamId, name: 'Service' });
  assert.equal(d.shift.name, 'Morning');
  assert.equal(d.status, 'Active');
  assert.equal(d.employment.username, 'kumari');
  assert.equal(d.salary.basic, 60000); // the owner sees Employment Records
  assert.equal(d.epf.employeeRate, 8);
  assert.equal(d.image, null);
  const text = JSON.stringify(res.body);
  for (const secret of ['Abc@1234', 'passwordHash', 'scrypt$', 'shopId', 'accountId', 'imagePath', 'storedName', 'phoneNormalized', 'usernameKey']) {
    assert.ok(!text.includes(secret), `response leaks ${secret}`);
  }
  const row = store.staff.get(d.id);
  assert.match(row.passwordHash, /^scrypt\$/);
  assert.notEqual(row.passwordHash, 'Abc@1234');
});

test('the roster follows the working days and shift of a new staff member', async () => {
  const d = await made();
  assert.deepEqual(store.roster.get(d.id), { mon: ref.shiftId, tue: ref.shiftId, wed: ref.shiftId, thu: ref.shiftId, fri: ref.shiftId, sat: 'off', sun: 'off' });
});

test('privileged fields in the body are ignored: shop, account, code, id, hash and image come from the server', async () => {
  const res = await create({ shopId: acc.shop2, accountId: 2, code: 'STF9999', id: 55, passwordHash: 'x', imagePath: '../../etc/passwd', deletedAt: 'x', permissions: ['everything'], role: 'owner' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const row = store.staff.get(res.body.data.id);
  assert.equal(row.shopId, acc.shop1);
  assert.equal(row.accountId, 1);
  assert.equal(row.code, 'STF0001');
  assert.notEqual(row.id, 55);
  assert.equal(row.imagePath, null);
  assert.equal(row.deletedAt, null);
  assert.match(row.passwordHash, /^scrypt\$/);
});

test('?shopId chooses one of the account\'s own shops; another account\'s shop is 404', async () => {
  const role2 = await makeRole(acc.shop2, 'Manager');
  const team2 = await makeTeam(acc.shop2, 'Service');
  const shift2 = await makeShift(acc.shop2, 'Morning', '06:00', '14:00');
  const own = await as(acc.owner, 'POST', `${S}?shopId=${acc.shop2}`, { json: staffBody({ roleId: role2.id, teamId: team2.id, shiftId: shift2.id }) });
  assert.equal(own.status, 201, JSON.stringify(own.body));
  assert.equal(store.staff.get(own.body.data.id).shopId, acc.shop2);
  assert.equal(own.body.data.code, 'STF0001'); // codes count per shop
  const foreign = await create({}, acc.owner, `?shopId=${acc.shop3}`);
  assert.equal(foreign.status, 404);
});

test('a role, team or shift of another shop cannot be used', async () => {
  const otherRole = await makeRole(acc.shop2, 'Chef');
  const res = await create({ roleId: otherRole.id });
  assert.equal(res.status, 400);
  assert.deepEqual(fieldsOf(res), ['roleId']);
});

test('validation: an empty body lists every required field', async () => {
  const res = await as(acc.owner, 'POST', S, { json: {} });
  assert.equal(res.status, 400);
  for (const f of ['name', 'gender', 'phone', 'email', 'nic', 'dob', 'address', 'emergencyContact', 'joinDate', 'roleId', 'teamId', 'employmentType', 'shiftId', 'hoursPerWeek', 'username', 'password']) {
    assert.ok(fieldsOf(res).includes(f), `missing error for ${f}: ${fieldsOf(res)}`);
  }
  assert.ok(!fieldsOf(res).includes('salary'), 'Employment Records are optional');
  assert.equal((await as(acc.owner, 'POST', S, { json: [] })).status, 400);
});

test('validation: individual fields', async () => {
  const bad = {
    email: [{ email: 'nope' }, 'email'],
    phone: [{ phone: 'abc' }, 'phone'],
    nic: [{ nic: '123' }, 'nic'],
    gender: [{ gender: 'x' }, 'gender'],
    dobFuture: [{ dob: '2999-01-01' }, 'dob'],
    dobFake: [{ dob: '2001-02-31' }, 'dob'],
    joinDate: [{ joinDate: '01/05/2025' }, 'joinDate'],
    employmentType: [{ employmentType: 'Slave' }, 'employmentType'],
    days: [{ workingDays: ['mon', 'funday'] }, 'workingDays'],
    daysDup: [{ workingDays: ['mon', 'mon'] }, 'workingDays'],
    daysEmpty: [{ workingDays: [] }, 'workingDays'],
    hours: [{ hoursPerWeek: 0 }, 'hoursPerWeek'],
    hours2: [{ hoursPerWeek: 169 }, 'hoursPerWeek'],
    password: [{ password: 'weakpass' }, 'password'],
    username: [{ username: 'has space' }, 'username'],
    name: [{ name: '   ' }, 'name'],
    emergency: [{ emergencyContact: { name: 'Nimal' } }, 'emergencyContact.relationship'],
    emergencyPhone: [{ emergencyContact: { name: 'N', relationship: 'B', phone: '12' } }, 'emergencyContact.phone'],
    basic: [{ salary: { type: 'Monthly', overtime: false, paymentMethod: 'Cash' } }, 'salary.basic'],
    basicZero: [{ salary: { type: 'Monthly', basic: 0, overtime: false, paymentMethod: 'Cash' } }, 'salary.basic'],
    ot: [{ salary: { type: 'Monthly', basic: 1000, overtime: true, paymentMethod: 'Cash' } }, 'salary.otRate'],
    overtimeString: [{ salary: { type: 'Monthly', basic: 1000, overtime: 'false', paymentMethod: 'Cash' } }, 'salary.overtime'],
    bank: [{ salary: { type: 'Monthly', basic: 1000, overtime: false, paymentMethod: 'Bank Transfer' } }, 'salary.bankName'],
    epfNumbers: [{ epf: { allowed: true } }, 'epf.employerNumber'],
    epfRate: [{ epf: { allowed: false, employeeRate: 101 } }, 'epf.employeeRate'],
    reason: [{ active: false }, 'inactiveReason'],
    activeString: [{ active: 'false' }, 'active'],
  };
  for (const [name, [over, field]] of Object.entries(bad)) {
    const res = await create(over);
    assert.equal(res.status, 400, `${name}: ${res.status} ${JSON.stringify(res.body)}`);
    assert.ok(fieldsOf(res).includes(field), `${name}: expected ${field}, got ${fieldsOf(res)}`);
  }
  assert.equal(store.staff.size, 0, 'nothing was stored');
  const text = JSON.stringify((await create({ password: 'weak' })).body);
  assert.ok(!text.includes('weak"'), 'the password is never echoed');
});

test('an inactive staff member needs a reason, and keeps it', async () => {
  const d = await made({ active: false, inactiveReason: 'Staff have to submit required documents' });
  assert.equal(d.status, 'Inactive');
  assert.equal(d.employment.inactiveReason, 'Staff have to submit required documents');
});

test('a turned-off shift cannot be assigned', async () => {
  const off = await makeShift(acc.shop1, 'Night', '22:00', '06:00', { active: false });
  const res = await create({ shiftId: off.id });
  assert.equal(res.status, 409);
});

test('duplicates: email, phone, NIC and username are refused with the field name', async () => {
  await made();
  const cases = [
    [{ email: 'KUMARI.PERERA@paipos.com', username: 'user2', phone: '0719999999', nic: '199612345679' }, 'email'],
    [{ email: 'b@paipos.com', username: 'user2', phone: '+94 71 555 1234'.replace('+94 ', '0'), nic: '199612345679' }, 'phone'],
    [{ email: 'b@paipos.com', username: 'user2', phone: '0719999999', nic: '1996 1234 5678' }, 'nic'],
    [{ email: 'b@paipos.com', username: 'KUMARI', phone: '0719999999', nic: '199612345679' }, 'username'],
  ];
  for (const [over, field] of cases) {
    const res = await create(over);
    assert.equal(res.status, 409, `${field}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.code, 'DUPLICATE');
    assert.deepEqual(fieldsOf(res), [field]);
  }
  assert.equal(store.staff.size, 1);
});

test('duplicates: the same email in another shop is fine, the same username is not, another account is independent', async () => {
  await made();
  const role2 = await makeRole(acc.shop2, 'Manager');
  const team2 = await makeTeam(acc.shop2, 'Service');
  const shift2 = await makeShift(acc.shop2, 'Morning', '06:00', '14:00');
  const ref2 = { roleId: role2.id, teamId: team2.id, shiftId: shift2.id };
  const sameEmail = await as(acc.owner, 'POST', `${S}?shopId=${acc.shop2}`, { json: staffBody(ref2, { username: 'other1x', phone: '0712223334', nic: '199000000001' }) });
  assert.equal(sameEmail.status, 201, JSON.stringify(sameEmail.body));
  const sameUser = await as(acc.owner, 'POST', `${S}?shopId=${acc.shop2}`, { json: staffBody(ref2, { email: 'x@y.com', phone: '0712223335', nic: '199000000002' }) });
  assert.equal(sameUser.status, 409);
  assert.deepEqual(fieldsOf(sameUser), ['username']);
  // another account
  const role3 = await makeRole(acc.shop3, 'Manager', {}, 2);
  const team3 = await makeTeam(acc.shop3, 'Service', 2);
  const shift3 = await makeShift(acc.shop3, 'Morning', '06:00', '14:00', {}, 2);
  const foreign = await as(acc.other, 'POST', S, { json: staffBody({ roleId: role3.id, teamId: team3.id, shiftId: shift3.id }) });
  assert.equal(foreign.status, 201, JSON.stringify(foreign.body));
});

test('list: newest first, pagination meta, result count', async () => {
  for (let i = 0; i < 9; i += 1) await seed({ name: `Person ${i}` });
  const page1 = await as(acc.owner, 'GET', `${S}?limit=4`);
  assert.equal(page1.status, 200);
  assert.deepEqual(page1.body.meta, { total: 9, page: 1, limit: 4, totalPages: 3 });
  assert.equal(page1.body.data.length, 4);
  assert.equal(page1.body.data[0].name, 'Person 8');
  const page3 = await as(acc.owner, 'GET', `${S}?limit=4&page=3`);
  assert.equal(page3.body.data.length, 1);
  assert.equal(page3.body.data[0].name, 'Person 0');
  const beyond = await as(acc.owner, 'GET', `${S}?limit=4&page=9`);
  assert.deepEqual(beyond.body.data, []);
  const item = page1.body.data[0];
  assert.deepEqual(Object.keys(item).sort(), ['active', 'code', 'email', 'id', 'image', 'lastLogin', 'name', 'phone', 'role', 'shift', 'status', 'team']);
});

test('list: search by name, email, phone and staff id', async () => {
  const a = await seed({ name: 'Michel Brown', email: 'michel.brown@paipos.com', phone: '071 137 1137', phoneNormalized: '0711371137' });
  await seed({ name: 'David Anderson', email: 'david@paipos.com' });
  const search = async (q) => (await as(acc.owner, 'GET', `${S}?q=${encodeURIComponent(q)}`)).body.data.map((s) => s.name);
  assert.deepEqual(await search('michel'), ['Michel Brown'], `q=${'michel'}`);
  assert.deepEqual(await search('MICHEL.BROWN@'), ['Michel Brown'], `q=${'MICHEL.BROWN@'}`);
  assert.deepEqual(await search('0711371137'), ['Michel Brown'], `q=${'0711371137'}`);
  assert.deepEqual(await search('071 137'), ['Michel Brown'], `q=${'071 137'}`);
  assert.deepEqual(await search(a.code), ['Michel Brown'], `q=${a.code}`);
  assert.deepEqual(await search('#STF1'), ['Michel Brown'], `q=${'#STF1'}`);
  assert.deepEqual(await search('stf0002'), ['David Anderson'], `q=${'stf0002'}`);
  assert.deepEqual(await search('nobody'), [], `q=${'nobody'}`);
});

test('list: filters by role, team, shift and status, alone and combined', async () => {
  const chef = await makeRole(acc.shop1, 'Chef');
  const cooking = await makeTeam(acc.shop1, 'Cooking');
  const night = await makeShift(acc.shop1, 'Night', '22:00', '06:00');
  await seed({ name: 'A' });
  await seed({ name: 'B', roleId: chef.id, teamId: cooking.id, shiftId: night.id });
  await seed({ name: 'C', roleId: chef.id, active: false, inactiveReason: 'On leave' });
  const names = async (qs) => (await as(acc.owner, 'GET', `${S}?${qs}`)).body.data.map((s) => s.name).sort();
  assert.deepEqual(await names(`roleId=${chef.id}`), ['B', 'C']);
  assert.deepEqual(await names(`teamId=${cooking.id}`), ['B']);
  assert.deepEqual(await names(`shiftId=${night.id}`), ['B']);
  assert.deepEqual(await names('status=active'), ['A', 'B']);
  assert.deepEqual(await names('status=inactive'), ['C']);
  assert.deepEqual(await names(`roleId=${chef.id}&status=active`), ['B']);
  assert.deepEqual(await names(`roleId=${chef.id}&status=active&teamId=${ref.teamId}`), []);
  assert.deepEqual(await names('status='), ['A', 'B', 'C'], 'an empty filter means all');
});

test('list and summary: invalid query parameters are 400', async () => {
  for (const qs of ['page=0', 'page=abc', 'limit=0', 'limit=101', 'status=zzz', 'roleId=abc', 'teamId=-1', 'shiftId=1.5', 'shopId=abc', 'status=active&status=inactive', `q=${'x'.repeat(101)}`]) {
    for (const url of [`${S}?${qs}`, `${S}/summary?${qs}`]) {
      const res = await as(acc.owner, 'GET', url);
      assert.equal(res.status, 400, `${url}: ${res.status}`);
    }
  }
});

test('empty data: an account without a shop gets empty structures, and cannot create staff', async () => {
  await createUser({ id: 9300, accountId: 3, role: 'owner', email: 'noshop@x.com' });
  const token = (await tokenFor(9300)).token;
  const list = await as(token, 'GET', S);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data, []);
  assert.deepEqual(list.body.meta, { total: 0, page: 1, limit: 10, totalPages: 1 });
  const sum = await as(token, 'GET', `${S}/summary`);
  assert.deepEqual(sum.body.data, { totalStaff: 0, activeStaff: 0, inactiveStaff: 0, staffOnDuty: 0, activeShift: null });
  const res = await as(token, 'POST', S, { json: staffBody({ roleId: 1, teamId: 1, shiftId: 1 }) });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'CONFLICT');
});

test('summary: totals are calculated from stored staff and ignore removed staff', async () => {
  // The "Morning" shift (06:00-14:00) from beforeEach is the active shift whenever the real time falls inside it, so pin the
  // shared clock to 20:00 local time (outside every shift here) and sign in again: the beforeEach session was issued at the real time.
  const evening = new Date();
  evening.setHours(20, 0, 0, 0);
  clock.advance(evening.getTime() - clock.now());
  const owner = (await tokenFor(OWNER)).token;
  const empty = await as(owner, 'GET', `${S}/summary`);
  assert.deepEqual(empty.body.data, { totalStaff: 0, activeStaff: 0, inactiveStaff: 0, staffOnDuty: 0, activeShift: null });
  await seed(); await seed(); await seed({ active: false, inactiveReason: 'x' });
  const gone = await seed();
  await as(owner, 'DELETE', `${S}/${gone.id}`);
  const sum = (await as(owner, 'GET', `${S}/summary`)).body.data;
  assert.equal(sum.totalStaff, 3);
  assert.equal(sum.activeStaff, 2);
  assert.equal(sum.inactiveStaff, 1);
  // shop 2 is separate
  const other = (await as(owner, 'GET', `${S}/summary?shopId=${acc.shop2}`)).body.data;
  assert.equal(other.totalStaff, 0);
});

test('view: one staff member by id; unknown, invalid and other-account ids', async () => {
  const s = await seed({ name: 'Michel Brown' });
  const res = await as(acc.owner, 'GET', `${S}/${s.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, 'Michel Brown');
  assert.equal(res.body.data.emergencyContact.name, 'Robert');
  assert.equal((await as(acc.owner, 'GET', `${S}/99999`)).status, 404);
  assert.equal((await as(acc.owner, 'GET', `${S}/abc`)).status, 400);
  assert.equal((await as(acc.other, 'GET', `${S}/${s.id}`)).status, 404, 'another account sees nothing');
});

test('edit: personal and employment sections change, the rest stays, the roster follows', async () => {
  const s = await made();
  const chef = await makeRole(acc.shop1, 'Chef');
  const night = await makeShift(acc.shop1, 'Night', '22:00', '06:00');
  const res = await as(acc.owner, 'PATCH', `${S}/${s.id}`, { json: { name: 'Kumari P', roleId: chef.id, shiftId: night.id, workingDays: ['sat', 'sun'], address: 'Jaffna', active: false, passwordHash: 'x' } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const d = res.body.data;
  assert.equal(d.name, 'Kumari P');
  assert.equal(d.role.name, 'Chef');
  assert.equal(d.shift.name, 'Night');
  assert.deepEqual(d.employment.workingDays, ['sat', 'sun']);
  assert.equal(d.email, 'kumari.perera@paipos.com', 'untouched');
  assert.equal(d.status, 'Active', 'status is not editable here');
  assert.equal(store.roster.get(s.id).sat, night.id);
  assert.equal(store.roster.get(s.id).mon, 'off');
  assert.match(store.staff.get(s.id).passwordHash, /^scrypt\$/);
  const salary = await as(acc.owner, 'PATCH', `${S}/${s.id}`, { json: { salary: { type: 'Daily', basic: 2500, overtime: false, paymentMethod: 'Cash' } } });
  assert.equal(salary.body.data.salary.type, 'Daily');
  assert.equal(salary.body.data.salary.bankName, null);
});

test('edit: validation, empty body, unknown id, duplicates of another staff member', async () => {
  const a = await made();
  const b = await made({ email: 'b@paipos.com', username: 'bbb', phone: '0712223334', nic: '199000000009' });
  assert.equal((await as(acc.owner, 'PATCH', `${S}/${a.id}`, { json: {} })).status, 400);
  assert.equal((await as(acc.owner, 'PATCH', `${S}/${a.id}`, { json: { email: 'bad' } })).status, 400);
  assert.equal((await as(acc.owner, 'PATCH', `${S}/${a.id}`, { json: { roleId: 99999 } })).status, 400);
  assert.equal((await as(acc.owner, 'PATCH', `${S}/99999`, { json: { name: 'X' } })).status, 404);
  const dup = await as(acc.owner, 'PATCH', `${S}/${b.id}`, { json: { email: 'kumari.perera@paipos.com' } });
  assert.equal(dup.status, 409);
  assert.deepEqual(fieldsOf(dup), ['email']);
  const same = await as(acc.owner, 'PATCH', `${S}/${a.id}`, { json: { email: 'kumari.perera@paipos.com', name: 'Same Email Fine' } });
  assert.equal(same.status, 200, 'keeping your own values is not a duplicate');
});

test('status: inactive needs a reason, active clears it', async () => {
  const s = await made();
  assert.equal((await as(acc.owner, 'PUT', `${S}/${s.id}/status`, { json: { active: false } })).status, 400);
  assert.equal((await as(acc.owner, 'PUT', `${S}/${s.id}/status`, { json: { active: 'no' } })).status, 400);
  const off = await as(acc.owner, 'PUT', `${S}/${s.id}/status`, { json: { active: false, inactiveReason: 'On long leave' } });
  assert.equal(off.status, 200);
  assert.equal(off.body.data.status, 'Inactive');
  assert.equal(off.body.data.employment.inactiveReason, 'On long leave');
  assert.equal((await as(acc.owner, 'GET', `${S}?status=inactive`)).body.data.length, 1);
  const on = await as(acc.owner, 'PUT', `${S}/${s.id}/status`, { json: { active: true, inactiveReason: 'ignored' } });
  assert.equal(on.body.data.status, 'Active');
  assert.equal(on.body.data.employment.inactiveReason, null);
  assert.equal((await as(acc.other, 'PUT', `${S}/${s.id}/status`, { json: { active: true } })).status, 404);
});

test('removal is reversible: hidden everywhere, values stay reserved, only the owner may remove or restore', async () => {
  const s = await made();
  assert.equal((await as(acc.admin, 'DELETE', `${S}/${s.id}`)).status, 403, 'admins hold no delete permission');
  assert.equal((await as(acc.other, 'DELETE', `${S}/${s.id}`)).status, 404);
  const res = await as(acc.owner, 'DELETE', `${S}/${s.id}`);
  assert.equal(res.status, 200);
  assert.equal((await as(acc.owner, 'GET', `${S}/${s.id}`)).status, 404);
  assert.equal((await as(acc.owner, 'GET', S)).body.data.length, 0);
  assert.equal(store.staff.size, 1, 'the record is kept');
  const reuse = await create();
  assert.equal(reuse.status, 409, 'its email, phone, NIC and username stay reserved');
  assert.equal((await as(acc.admin, 'POST', `${S}/${s.id}/restore`)).status, 403);
  const back = await as(acc.owner, 'POST', `${S}/${s.id}/restore`);
  assert.equal(back.status, 200);
  assert.equal(back.body.data.id, s.id);
  assert.equal((await as(acc.owner, 'GET', `${S}/${s.id}`)).status, 200);
  assert.equal((await as(acc.owner, 'POST', `${S}/99999/restore`)).status, 404);
});

test('permissions: admins never see or change Employment Records and cannot hand out more than they hold', async () => {
  const powerful = await makeRole(acc.shop1, 'Boss', { 'Staff Management': ['view', 'add', 'edit', 'delete'] });
  const limited = await makeRole(acc.shop1, 'Waiter', { 'Staff Management': ['view'] });
  const full = await made();
  const asAdmin = await as(acc.admin, 'GET', `${S}/${full.id}`);
  assert.equal(asAdmin.status, 200);
  for (const key of ['salary', 'epf', 'documents']) assert.ok(!(key in asAdmin.body.data), `admin must not see ${key}`);
  assert.ok(!JSON.stringify(asAdmin.body).includes('60000'));
  // creating with salary or EPF is the owner's
  assert.equal((await create({ email: 'a1@x.com', username: 'adm1', phone: '0713334441', nic: '199100000001' }, acc.admin)).status, 403);
  // creating without Employment Records works
  const body = staffBody(ref, { email: 'a2@x.com', username: 'adm2', phone: '0713334442', nic: '199100000002' });
  delete body.salary; delete body.epf;
  const ok = await as(acc.admin, 'POST', S, { json: body });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.data.code, 'STF0002');
  assert.ok(!('salary' in ok.body.data));
  assert.equal(store.staff.get(ok.body.data.id).salary, null);
  // editing salary is the owner's
  assert.equal((await as(acc.admin, 'PATCH', `${S}/${full.id}`, { json: { salary: { type: 'Monthly', basic: 9, overtime: false, paymentMethod: 'Cash' } } })).status, 403);
  assert.equal((await as(acc.admin, 'PATCH', `${S}/${full.id}`, { json: { name: 'Edited By Admin' } })).status, 200);
  // role escalation: an admin may assign a role they fully hold, not one with permissions they lack
  const bad = await as(acc.admin, 'PATCH', `${S}/${full.id}`, { json: { roleId: powerful.id } });
  assert.equal(bad.status, 403);
  assert.equal(bad.body.message, 'You cannot assign a role that holds permissions you do not have yourself');
  assert.equal((await as(acc.admin, 'PATCH', `${S}/${full.id}`, { json: { roleId: limited.id } })).status, 200);
  assert.equal((await create({ email: 'a3@x.com', username: 'adm3', phone: '0713334443', nic: '199100000003', roleId: powerful.id }, acc.admin)).status, 403);
  assert.equal((await create({ email: 'a4@x.com', username: 'adm4', phone: '0713334444', nic: '199100000004', roleId: powerful.id })).status, 201, 'the owner holds everything');
});

test('every staff route needs a signed-in user', async () => {
  const s = await seed();
  const routes = [['GET', S], ['GET', `${S}/summary`], ['POST', S], ['GET', `${S}/${s.id}`], ['PATCH', `${S}/${s.id}`], ['PUT', `${S}/${s.id}/status`],
    ['DELETE', `${S}/${s.id}`], ['POST', `${S}/${s.id}/restore`], ['GET', `${S}/${s.id}/image`], ['POST', `${S}/${s.id}/image`], ['GET', `${S}/${s.id}/documents/cv`]];
  ctx.token = null;
  for (const [method, url] of routes) {
    const res = await api(method, url, method === 'GET' || method === 'DELETE' ? {} : { json: {} });
    assert.equal(res.status, 401, `${method} ${url}`);
  }
  const forged = await api('GET', S, { headers: { authorization: 'Bearer not.a.token' } });
  assert.equal(forged.status, 401);
});

test('creating staff is rate limited per signed-in user', async () => {
  store.rateLimits.set(`staffWrite:${OWNER}`, Array.from({ length: 120 }, () => Date.now()));
  const res = await create();
  assert.equal(res.status, 429);
  assert.ok(res.headers.get('retry-after'));
});

test('picture upload: real PNG/JPEG only, size limited, private storage and private download', async () => {
  const s = await seed();
  const up = (buffer, name, token = acc.owner) => as(token, 'POST', `${S}/${s.id}/image`, { form: multipart('image', buffer, name, 'image/png') });

  const fakeText = await up(Buffer.from('<?php echo 1; ?> not an image at all'), 'evil.png');
  assert.equal(fakeText.status, 415);
  assert.equal((await up(PDF, 'file.png')).status, 415, 'a PDF renamed to .png is refused');
  assert.equal((await up(Buffer.alloc(3 * 1024 * 1024, 1), 'big.png')).status, 413);
  assert.equal((await as(acc.owner, 'POST', `${S}/${s.id}/image`, { form: multipart('wrongfield', PNG, 'a.png') })).status, 400);
  assert.equal((await up(PNG, 'a.png', acc.other)).status, 404, 'another account cannot upload');
  assert.equal((await up(PNG, '../../../evil.exe')).status, 200, 'the client file name is irrelevant');
  track();

  const row = store.staff.get(s.id);
  assert.match(row.imagePath, /^[0-9a-f-]{36}\.png$/, 'a generated name');
  assert.ok(fs.existsSync(path.join(uploads.staffDir, row.imagePath)));
  const detail = (await as(acc.owner, 'GET', `${S}/${s.id}`)).body.data;
  assert.equal(detail.image, `/api/v1/staff/${s.id}/image`);
  assert.ok(!JSON.stringify(detail).includes(row.imagePath), 'the stored name is not exposed');

  const download = await as(acc.owner, 'GET', `${S}/${s.id}/image`);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'image/png');
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert.match(download.headers.get('cache-control'), /private/);
  assert.ok(download.bytes.equals(PNG));
  assert.equal((await as(acc.other, 'GET', `${S}/${s.id}/image`)).status, 404);
  assert.equal((await api('GET', `/uploads/staff/${row.imagePath}`)).status, 404, 'the folder is not served statically');

  const old = row.imagePath;
  assert.equal((await up(PNG, 'second.png')).status, 200);
  track();
  assert.ok(!fs.existsSync(path.join(uploads.staffDir, old)), 'the replaced picture is deleted');
});

test('document upload: owner only, real type per slot, 5 MB, private download', async () => {
  const s = await seed();
  const up = (slot, buffer, name, token = acc.owner) => as(token, 'POST', `${S}/${s.id}/documents/${slot}`, { form: multipart('file', buffer, name) });
  const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....word/document.xml....')]);

  assert.equal((await up('agreement', PDF, 'a.pdf', acc.admin)).status, 403, 'admins cannot upload documents');
  assert.equal((await up('agreement', PNG, 'a.pdf')).status, 415, 'a PNG is not a PDF');
  assert.equal((await up('agreement', Buffer.from('MZ fake executable bytes....'), 'virus.pdf')).status, 415);
  assert.equal((await up('cv', PNG, 'cv.pdf')).status, 415, 'images are not allowed for a CV');
  assert.equal((await up('agreement', docx, 'a.pdf')).status, 415, 'DOCX is not allowed for the agreement');
  assert.equal((await up('nonsense', PDF, 'a.pdf')).status, 400);
  assert.equal((await up('cv', Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024)]), 'big.pdf')).status, 413);
  assert.equal((await as(acc.owner, 'POST', `${S}/${s.id}/documents/cv`, { form: multipart('image', PDF, 'a.pdf') })).status, 400);

  assert.equal((await up('agreement', PDF, 'Signed Agreement (final).pdf')).status, 200);
  assert.equal((await up('idCopy', PNG, 'nic.png')).status, 200);
  assert.equal((await up('cv', docx, '../../cv.docx')).status, 200);
  track();
  const detail = (await as(acc.owner, 'GET', `${S}/${s.id}`)).body.data;
  assert.equal(detail.documents.agreement.fileName, 'Signed Agreement (final).pdf');
  assert.equal(detail.documents.agreement.type, 'pdf');
  assert.ok(!JSON.stringify(detail).includes('storedName'));
  assert.ok(!detail.documents.cv.fileName.includes('/'), 'the label is sanitised');

  const down = await as(acc.owner, 'GET', `${S}/${s.id}/documents/agreement`);
  assert.equal(down.status, 200);
  assert.equal(down.headers.get('content-type'), 'application/pdf');
  assert.equal(down.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(down.bytes.equals(PDF));
  assert.equal((await as(acc.admin, 'GET', `${S}/${s.id}/documents/agreement`)).status, 403);
  assert.equal((await as(acc.other, 'GET', `${S}/${s.id}/documents/agreement`)).status, 404);
  assert.equal((await as(acc.owner, 'GET', `${S}/${s.id}/documents/..%2Fx`)).status, 400, 'a path-like slot is refused');
});
