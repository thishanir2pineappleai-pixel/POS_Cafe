// The Staff repository contract (staff, roles, teams, shifts and roster, attendance, leave, payroll), run against the in-memory
// driver ALWAYS and against MySQL (Prisma) when STAFF_TEST_DATABASE_URL points at a database whose name ends in _test (its
// tables are emptied). Both drivers must behave the same, because the services cannot tell them apart.
const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { testDatabase } = require('@pos-cafe/shared/testing/database');
const { DuplicateError } = require('../../repositories/errors');

const db = testDatabase('STAFF_TEST_DATABASE_URL');
const load = (driver) => ({
  staff: require(`../../repositories/${driver}/staffRepository`),
  roles: require(`../../repositories/${driver}/staffRoleRepository`).roles,
  teams: require(`../../repositories/${driver}/staffRoleRepository`).teams,
  shifts: require(`../../repositories/${driver}/shiftRepository`),
  attendance: require(`../../repositories/${driver}/attendanceRepository`).attendance,
  leaves: require(`../../repositories/${driver}/attendanceRepository`).leaves,
  payroll: require(`../../repositories/${driver}/payrollRepository`),
});

const drivers = [{ name: 'memory', load: () => ({ r: load('memory'), reset: require('../../repositories/memory/store').reset }) }];
if (db) {
  drivers.push({
    name: 'prisma (MySQL test database)',
    load: () => {
      process.env.REPOSITORY_DRIVER = 'prisma';
      process.env.STAFF_DATABASE_URL = db.url;
      const { prisma } = require('../../repositories/prisma/client');
      return {
        r: load('prisma'),
        reset: async () => {
          for (const m of ['payrollDeduction', 'payrollReward', 'payrollRecord', 'leave', 'attendance', 'shiftAssignment', 'staffDocument', 'staff', 'shift', 'staffTeam', 'staffRole']) await prisma[m].deleteMany();
        },
        close: () => prisma.$disconnect(),
      };
    },
  });
}

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const roster = (shiftId, work = ['mon', 'tue', 'wed', 'thu', 'fri']) => Object.fromEntries(ALL_DAYS.map((d) => [d, work.includes(d) ? shiftId : 'off']));

for (const driver of drivers) {
  describe(`Staff repositories: ${driver.name}`, () => {
    let r; let reset; let close;
    before(() => { ({ r, reset, close } = driver.load()); });
    after(async () => { await reset(); if (close) await close(); });
    beforeEach(async () => { await reset(); });

    const base = async (shopId = 1, accountId = 1) => ({
      role: await r.roles.create({ accountId, shopId, name: `Role ${shopId}-${Math.random()}`.slice(0, 40), grants: {} }),
      team: await r.teams.create({ accountId, shopId, name: `Team ${shopId}-${Math.random()}`.slice(0, 40) }),
      shift: await r.shifts.create({ accountId, shopId, name: `Shift ${shopId}-${Math.random()}`.slice(0, 40), startTime: '09:00', endTime: '17:00', active: true }),
    });
    let n = 0;
    const staffData = (ids, over = {}) => {
      n += 1;
      return {
        accountId: 1, shopId: 1, name: `Staff ${n}`, gender: 'Female', phone: `071 555 ${1000 + n}`, phoneNormalized: `0715551${String(n).padStart(3, '0')}`, email: `staff${n}@paipos.com`,
        nic: `19900000${String(n).padStart(4, '0')}`, dob: '2001-04-21', address: 'Kandy', emergencyContact: { name: 'Nimal', relationship: 'Brother', phone: '071 123 4567' },
        imagePath: null, joinDate: '2025-05-01', roleId: ids.role.id, teamId: ids.team.id, shiftId: ids.shift.id, employmentType: 'Fulltime', active: true, inactiveReason: null,
        workingDays: ['mon', 'tue', 'wed', 'thu', 'fri'], hoursPerWeek: 40, username: `User${n}`, usernameKey: `user${n}`, passwordHash: 'scrypt$hash',
        salary: { type: 'Monthly', basic: 60000.5, overtime: true, otRate: 100, paymentMethod: 'Bank Transfer', bankName: 'BOC - Jaffna', accountNumber: '1234 4567 8910' },
        epf: { allowed: true, employerNumber: '123456/A', employeeNumber: '00789', employeeRate: 8, employerRate: 12, etfRate: 3 },
        documents: { cv: null, idCopy: null, agreement: null },
        ...over,
      };
    };

    test('create returns the whole row: generated code, nested sections and documents, ISO dates and plain numbers', async () => {
      const ids = await base();
      const row = await r.staff.create(staffData(ids), roster(ids.shift.id));
      assert.deepEqual([row.codeNumber, row.code, row.deletedAt, row.imagePath, row.active], [1, 'STF0001', null, null, true]);
      assert.deepEqual([row.dob, row.joinDate, typeof row.createdAt], ['2001-04-21', '2025-05-01', 'string']);
      assert.deepEqual(row.emergencyContact, { name: 'Nimal', relationship: 'Brother', phone: '071 123 4567' });
      assert.deepEqual(row.salary, { type: 'Monthly', basic: 60000.5, overtime: true, otRate: 100, paymentMethod: 'Bank Transfer', bankName: 'BOC - Jaffna', accountNumber: '1234 4567 8910' });
      assert.deepEqual(row.epf, { allowed: true, employerNumber: '123456/A', employeeNumber: '00789', employeeRate: 8, employerRate: 12, etfRate: 3 });
      assert.deepEqual(row.documents, { cv: null, idCopy: null, agreement: null });
      assert.deepEqual(row.workingDays, ['mon', 'tue', 'wed', 'thu', 'fri']);
      assert.deepEqual(await r.shifts.getRoster(row.id), roster(ids.shift.id));
      const none = await r.staff.create(staffData(ids, { salary: null, epf: null }), roster(ids.shift.id));
      assert.deepEqual([none.salary, none.epf], [null, null], 'sections that were never sent stay null');
    });

    test('codes count per shop and are never reused, even after a removal', async () => {
      const a = await base(1); const b = await base(2);
      const s1 = await r.staff.create(staffData(a), roster(a.shift.id));
      const s2 = await r.staff.create(staffData(a), roster(a.shift.id));
      const other = await r.staff.create(staffData(b, { shopId: 2 }), roster(b.shift.id));
      assert.deepEqual([s1.code, s2.code, other.code], ['STF0001', 'STF0002', 'STF0001']);
      await r.staff.setRemoved(s2.id, new Date().toISOString());
      assert.equal((await r.staff.create(staffData(a), roster(a.shift.id))).code, 'STF0003', 'the removed STF0002 is not handed out again');
    });

    test('duplicates: email, phone and NIC per shop, username per account; removed staff keep their values reserved', async () => {
      const a = await base(1); const b = await base(2); const c = await base(3, 2);
      const first = await r.staff.create(staffData(a), roster(a.shift.id));
      const clash = async (over, ids = a) => { try { await r.staff.create(staffData(ids, over), roster(ids.shift.id)); return null; } catch (e) { assert.ok(e instanceof DuplicateError, String(e)); return e.duplicateField; } };
      assert.equal(await clash({ email: first.email }), 'email');
      assert.equal(await clash({ phoneNormalized: first.phoneNormalized }), 'phone');
      assert.equal(await clash({ nic: first.nic }), 'nic');
      assert.equal(await clash({ usernameKey: first.usernameKey }), 'username');
      assert.equal(await clash({ usernameKey: first.usernameKey, shopId: 2 }, b), 'username', 'a username is unique per ACCOUNT, across its shops');
      assert.equal(await clash({ email: first.email, shopId: 2 }, b), null, 'the same email in another shop is fine');
      assert.equal(await clash({ nic: first.nic, shopId: 3, accountId: 2, usernameKey: 'someone-else' }, c), null, 'another account is independent');
      await r.staff.setRemoved(first.id, new Date().toISOString());
      assert.equal(await clash({ email: first.email }), 'email', 'a removed staff member still reserves the email');
      assert.equal(await r.staff.list(1).then((l) => l.length), 0);
    });

    test('list is per shop, newest first, without removed staff; findById is scoped to the account and hides removed staff', async () => {
      const a = await base(1); const b = await base(2);
      const s1 = await r.staff.create(staffData(a, { name: 'First' }), roster(a.shift.id));
      const s2 = await r.staff.create(staffData(a, { name: 'Second' }), roster(a.shift.id));
      await r.staff.create(staffData(b, { shopId: 2, name: 'Elsewhere' }), roster(b.shift.id));
      assert.deepEqual((await r.staff.list(1)).map((s) => s.name), ['Second', 'First']);
      assert.equal((await r.staff.findById(1, s1.id)).name, 'First');
      assert.equal(await r.staff.findById(2, s1.id), null, "another account's staff member does not exist for the caller");
      assert.equal(await r.staff.findById(1, s1.id + 999), null);
      await r.staff.setRemoved(s2.id, '2026-01-01T00:00:00.000Z');
      assert.equal(await r.staff.findById(1, s2.id), null);
      const gone = await r.staff.findById(1, s2.id, { withRemoved: true });
      assert.equal(gone.deletedAt, '2026-01-01T00:00:00.000Z');
      await r.staff.setRemoved(s2.id, null);
      assert.equal((await r.staff.findById(1, s2.id)).deletedAt, null, 'restore');
      assert.equal(await r.staff.setRemoved(s2.id + 999, null), null);
    });

    test('update changes only what is sent, replaces whole sections, can clear them, and rewrites the roster', async () => {
      const ids = await base();
      const row = await r.staff.create(staffData(ids), roster(ids.shift.id));
      const u = await r.staff.update(row.id, { name: 'Renamed', salary: { type: 'Daily', basic: 2500, overtime: false, otRate: null, paymentMethod: 'Cash', bankName: null, accountNumber: null }, emergencyContact: { name: 'Sam', relationship: 'Friend', phone: '0712223333' } }, roster(ids.shift.id, ['sat', 'sun']));
      assert.deepEqual([u.name, u.email, u.phone, u.epf.allowed, u.codeNumber], ['Renamed', row.email, row.phone, true, 1]);
      assert.deepEqual(u.salary, { type: 'Daily', basic: 2500, overtime: false, otRate: null, paymentMethod: 'Cash', bankName: null, accountNumber: null });
      assert.deepEqual(u.emergencyContact, { name: 'Sam', relationship: 'Friend', phone: '0712223333' });
      assert.deepEqual(await r.shifts.getRoster(row.id), roster(ids.shift.id, ['sat', 'sun']));
      assert.ok(u.updatedAt >= row.updatedAt);
      const cleared = await r.staff.update(row.id, { epf: null, active: false, inactiveReason: 'Resigned' });
      assert.deepEqual([cleared.epf, cleared.active, cleared.inactiveReason], [null, false, 'Resigned']);
      assert.deepEqual(await r.shifts.getRoster(row.id), roster(ids.shift.id, ['sat', 'sun']), 'the roster is kept when none is sent');
      assert.equal(await r.staff.update(row.id + 999, { name: 'x' }), null);
    });

    test('update refuses a value another staff member already has, and keeping your own values is fine', async () => {
      const ids = await base();
      const a = await r.staff.create(staffData(ids), roster(ids.shift.id));
      const b = await r.staff.create(staffData(ids), roster(ids.shift.id));
      await assert.rejects(r.staff.update(b.id, { email: a.email }), (e) => e instanceof DuplicateError && e.duplicateField === 'email');
      await assert.rejects(r.staff.update(b.id, { nic: a.nic }), (e) => e instanceof DuplicateError && e.duplicateField === 'nic');
      await assert.rejects(r.staff.update(b.id, { usernameKey: a.usernameKey }), (e) => e instanceof DuplicateError && e.duplicateField === 'username');
      assert.equal((await r.staff.findById(1, b.id)).email, b.email, 'a refused update changes nothing');
      assert.equal((await r.staff.update(b.id, { email: b.email, name: 'Same email' })).name, 'Same email');
    });

    test('image path and the private documents: previous values come back, documents replace per slot', async () => {
      const ids = await base();
      const row = await r.staff.create(staffData(ids), roster(ids.shift.id));
      assert.equal(await r.staff.setImagePath(row.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'), null);
      assert.equal(await r.staff.setImagePath(row.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg'), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png');
      assert.equal(await r.staff.setImagePath(row.id + 999, 'cccccccc-cccc-cccc-cccc-cccccccccccc.png'), undefined);
      const doc = { storedName: 'dddddddd-dddd-dddd-dddd-dddddddddddd.pdf', fileName: 'agreement (1).pdf', type: 'pdf', size: 1234, uploadedAt: '2026-03-01T10:20:30.456Z' };
      assert.equal(await r.staff.setDocument(row.id, 'agreement', doc), null);
      assert.deepEqual((await r.staff.findById(1, row.id)).documents, { cv: null, idCopy: null, agreement: doc });
      const next = { ...doc, storedName: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee.pdf', size: 99 };
      assert.deepEqual(await r.staff.setDocument(row.id, 'agreement', next), doc, 'the previous document is returned so its file can be deleted');
      assert.deepEqual((await r.staff.findById(1, row.id)).documents.agreement, next);
      assert.equal((await r.staff.list(1))[0].documents.agreement.size, 99, 'lists carry documents too');
    });

    test('countUsing counts staff of the shop that use a role, team or shift (removed ones too)', async () => {
      const a = await base(1); const b = await base(2);
      const s1 = await r.staff.create(staffData(a), roster(a.shift.id));
      await r.staff.create(staffData(a), roster(a.shift.id));
      await r.staff.create(staffData(b, { shopId: 2 }), roster(b.shift.id));
      await r.staff.setRemoved(s1.id, new Date().toISOString());
      assert.deepEqual([await r.staff.countUsing(1, 'roleId', a.role.id), await r.staff.countUsing(1, 'teamId', a.team.id), await r.staff.countUsing(1, 'shiftId', a.shift.id)], [2, 2, 2]);
      assert.equal(await r.staff.countUsing(1, 'roleId', b.role.id), 0);
    });

    test('roles, teams and shifts: scoped CRUD, names unique per shop ignoring case, grants round-trip', async () => {
      const grants = { 'Staff Management': ['view', 'add'], 'Menu Management': ['view'] };
      const role = await r.roles.create({ accountId: 1, shopId: 1, name: 'Cashier', grants });
      assert.deepEqual([role.name, role.grants, typeof role.createdAt], ['Cashier', grants, 'string']);
      await assert.rejects(r.roles.create({ accountId: 1, shopId: 1, name: 'CASHIER', grants: {} }), (e) => e instanceof DuplicateError && e.duplicateField === 'name');
      assert.equal((await r.roles.create({ accountId: 1, shopId: 2, name: 'cashier', grants: {} })).shopId, 2, 'the same name in another shop is fine');
      assert.deepEqual((await r.roles.list(1)).map((x) => x.name), ['Cashier']);
      assert.equal((await r.roles.find(1, role.id)).name, 'Cashier');
      assert.equal(await r.roles.find(2, role.id), null, 'another account cannot see it');
      assert.deepEqual((await r.roles.update(role.id, { grants: { 'Staff Management': ['view'] } })).grants, { 'Staff Management': ['view'] });
      assert.equal((await r.roles.update(role.id, { name: 'Head Cashier' })).name, 'Head Cashier');
      const other = await r.roles.create({ accountId: 1, shopId: 1, name: 'Waiter', grants: {} });
      await assert.rejects(r.roles.update(other.id, { name: 'head cashier' }), (e) => e instanceof DuplicateError);
      assert.equal(await r.roles.update(role.id + 999, { name: 'x' }), null);
      assert.equal(await r.roles.remove(other.id), true);
      assert.equal(await r.roles.remove(other.id), false);

      const team = await r.teams.create({ accountId: 1, shopId: 1, name: 'Service' });
      assert.deepEqual([team.name, (await r.teams.list(1)).length], ['Service', 1]);
      await assert.rejects(r.teams.create({ accountId: 1, shopId: 1, name: 'service' }), (e) => e instanceof DuplicateError);

      const shift = await r.shifts.create({ accountId: 1, shopId: 1, name: 'Night', startTime: '22:00', endTime: '06:00', active: true });
      assert.deepEqual([shift.startTime, shift.endTime, shift.active], ['22:00', '06:00', true]);
      assert.equal((await r.shifts.update(shift.id, { active: false })).active, false);
      await assert.rejects(r.shifts.create({ accountId: 1, shopId: 1, name: 'NIGHT', startTime: '01:00', endTime: '02:00', active: true }), (e) => e instanceof DuplicateError);
    });

    test('roster: set replaces everything, "off" days and missing days are kept apart, isRostered is per shop', async () => {
      const a = await base(1); const b = await base(2);
      const s = await r.staff.create(staffData(a), { mon: a.shift.id, tue: 'off' });
      assert.deepEqual(await r.shifts.getRoster(s.id), { mon: a.shift.id, tue: 'off' }, 'a day with nothing assigned stays absent');
      assert.equal(await r.shifts.isRostered(1, a.shift.id), true);
      assert.equal(await r.shifts.isRostered(2, a.shift.id), false, 'another shop');
      assert.equal(await r.shifts.isRostered(1, b.shift.id), false);
      await r.shifts.setRoster(s.id, { wed: a.shift.id });
      assert.deepEqual(await r.shifts.getRoster(s.id), { wed: a.shift.id });
      await r.shifts.clearRoster(s.id);
      assert.deepEqual(await r.shifts.getRoster(s.id), {});
      assert.equal(await r.shifts.isRostered(1, a.shift.id), false);
      assert.deepEqual(await r.shifts.getRoster(s.id + 999), {});
    });

    test('attendance: find and list by date, update the check-out, local times kept as written', async () => {
      const ids = await base();
      const s = await r.staff.create(staffData(ids), roster(ids.shift.id));
      const rec = await r.attendance.create({ accountId: 1, shopId: 1, staffId: s.id, date: '2026-03-21', checkInAt: '2026-03-21T10:30:00', checkOutAt: null });
      assert.deepEqual([rec.date, rec.checkInAt, rec.checkOutAt], ['2026-03-21', '2026-03-21T10:30:00', null]);
      assert.equal((await r.attendance.findByStaffDate(1, s.id, '2026-03-21')).id, rec.id);
      assert.equal(await r.attendance.findByStaffDate(1, s.id, '2026-03-22'), null);
      assert.equal(await r.attendance.findByStaffDate(2, s.id, '2026-03-21'), null, 'another shop');
      assert.deepEqual((await r.attendance.listByDate(1, '2026-03-21')).map((x) => x.id), [rec.id]);
      assert.deepEqual(await r.attendance.listByDate(1, '2026-03-22'), []);
      assert.equal((await r.attendance.update(rec.id, { checkOutAt: '2026-03-21T17:30:00' })).checkOutAt, '2026-03-21T17:30:00');
      assert.equal((await r.attendance.find(1, rec.id)).checkOutAt, '2026-03-21T17:30:00');
      assert.equal(await r.attendance.find(2, rec.id), null);
    });

    test('leave: types and times, find by date (ignoring one id), list on a date, update and delete', async () => {
      const ids = await base();
      const s = await r.staff.create(staffData(ids), roster(ids.shift.id));
      const hour = await r.leaves.create({ accountId: 1, shopId: 1, staffId: s.id, type: 'hour_permission', date: '2026-03-21', startTime: '13:00', endTime: '14:00', half: null, reason: 'Personal Work' });
      assert.deepEqual([hour.type, hour.startTime, hour.endTime, hour.half, hour.reason], ['hour_permission', '13:00', '14:00', null, 'Personal Work']);
      assert.equal((await r.leaves.findByStaffDate(1, s.id, '2026-03-21')).id, hour.id);
      assert.equal(await r.leaves.findByStaffDate(1, s.id, '2026-03-21', hour.id), null, 'ignoring itself when it is being edited');
      assert.deepEqual((await r.leaves.listOn(1, '2026-03-21')).map((x) => x.id), [hour.id]);
      const half = await r.leaves.update(hour.id, { type: 'half_day', startTime: null, endTime: null, half: 'second', reason: 'Appointment', date: '2026-03-22', staffId: s.id });
      assert.deepEqual([half.type, half.half, half.startTime, half.date], ['half_day', 'second', null, '2026-03-22']);
      assert.equal(await r.leaves.remove(hour.id), true);
      assert.equal(await r.leaves.find(1, hour.id), null);
      assert.equal(await r.leaves.remove(hour.id), false);
    });

    test('payroll: records, one per staff and month lookup, pay snapshot, rewards and deductions with plain numbers', async () => {
      const ids = await base();
      const s = await r.staff.create(staffData(ids), roster(ids.shift.id));
      const rec = await r.payroll.records.create({ accountId: 1, shopId: 1, staffId: s.id, payDate: '2026-03-31', basicSalary: 60000.5, paidOn: null, snapshot: null });
      assert.deepEqual([rec.payDate, rec.basicSalary, rec.paidOn, rec.snapshot], ['2026-03-31', 60000.5, null, null]);
      assert.equal((await r.payroll.records.findByStaffMonth(1, s.id, '2026-03')).id, rec.id);
      assert.equal(await r.payroll.records.findByStaffMonth(1, s.id, '2026-04'), null);
      assert.equal(await r.payroll.records.findByStaffMonth(1, s.id, '2026-03', rec.id), null, 'ignoring itself');
      assert.equal((await r.payroll.records.find(1, rec.id)).id, rec.id);
      assert.equal(await r.payroll.records.find(2, rec.id), null);

      const edited = await r.payroll.records.update(rec.id, { basicSalary: 61000, payDate: '2026-04-05' });
      assert.deepEqual([edited.basicSalary, edited.payDate], [61000, '2026-04-05']);
      const snapshot = { rewards: 5000, deductions: 1500.25, netPay: 64499.75 };
      const paid = await r.payroll.records.update(rec.id, { paidOn: '2026-04-05T09:30:00.123Z', snapshot });
      assert.deepEqual([paid.paidOn, paid.snapshot], ['2026-04-05T09:30:00.123Z', snapshot]);
      assert.deepEqual((await r.payroll.records.list(1)).map((x) => x.snapshot), [snapshot]);

      const reward = await r.payroll.rewards.create({ accountId: 1, shopId: 1, staffId: s.id, date: '2026-04-01', reason: 'Other', specificReason: 'Great month', amount: 5000.5 });
      const deduction = await r.payroll.deductions.create({ accountId: 1, shopId: 1, staffId: s.id, date: '2026-04-02', reason: 'Salary Advance', specificReason: null, totalAmount: 9000, monthlyAmount: 3000.75 });
      assert.deepEqual([reward.amount, reward.specificReason, reward.date], [5000.5, 'Great month', '2026-04-01']);
      assert.deepEqual([deduction.totalAmount, deduction.monthlyAmount, deduction.specificReason], [9000, 3000.75, null]);
      assert.equal((await r.payroll.rewards.update(reward.id, { amount: 6000 })).amount, 6000);
      assert.equal((await r.payroll.deductions.list(1)).length, 1);
      assert.equal(await r.payroll.rewards.remove(reward.id), true);
      assert.deepEqual(await r.payroll.rewards.list(1), []);
    });

    test('text round-trips unchanged, including non-English names and the longest allowed values', async () => {
      const ids = await base();
      const row = await r.staff.create(staffData(ids, { name: 'கார்த்திக் Ñandú 日本語 🙂', address: 'a'.repeat(255), username: 'u'.repeat(50), usernameKey: 'u'.repeat(50), email: `${'e'.repeat(240)}@x.com`, nic: '199012345678', hoursPerWeek: 168 }), roster(ids.shift.id));
      const back = await r.staff.findById(1, row.id);
      assert.deepEqual([back.name, back.address.length, back.username.length, back.email.length, back.hoursPerWeek], ['கார்த்திக் Ñandú 日本語 🙂', 255, 50, 246, 168]);
    });
  });
}

if (!db) test('MySQL repository tests', { skip: 'STAFF_TEST_DATABASE_URL is not set (database name must end in _test); only the memory driver was tested' }, () => {});
