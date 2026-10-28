// Restart persistence: the Staff Service runs as a REAL process on MySQL (Prisma). Roles, teams, shifts, a staff member with a
// roster, a picture and a private document, attendance, leave and payroll (including a paid record and its frozen figures)
// are created through the HTTP API, the process is stopped and started again, and everything must be identical. Needs
// STAFF_TEST_DATABASE_URL (a database whose name ends in _test, already migrated). Without it the tests are SKIPPED and say
// so. The Auth and Settings services are stand-ins that keep their real internal contracts.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { testDatabase } = require('@pos-cafe/shared/testing/database');
const { startFakeAuthService } = require('@pos-cafe/shared/testing/fakeAuthService');
const { startFakeSettingsService } = require('@pos-cafe/shared/testing/fakeSettingsService');
const { startServiceProcess, freePort } = require('@pos-cafe/shared/testing/serviceProcess');

const db = testDatabase('STAFF_TEST_DATABASE_URL');
const SERVICE_DIR = path.resolve(__dirname, '../..');
const skip = db ? false : 'STAFF_TEST_DATABASE_URL is not set: persistence was NOT tested';
const secret = crypto.randomBytes(24).toString('hex');
const internalKey = crypto.randomBytes(24).toString('hex');
const OWNER = { userId: 7, accountId: 41, role: 'owner' };
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake-image-data'), Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n');

let auth; let settings; let port; let service; let prisma; let uploads; let shopId;
const start = () => startServiceProcess({
  serviceDir: SERVICE_DIR,
  port,
  env: {
    REPOSITORY_DRIVER: 'prisma', STAFF_DATABASE_URL: db.url, STAFF_SERVICE_PORT: String(port), HOST: '127.0.0.1', JWT_SECRET: secret, INTERNAL_SERVICE_KEY: internalKey,
    AUTH_SERVICE_URL: auth.url, SETTINGS_SERVICE_URL: settings.url, UPLOADS_DIR: uploads,
  },
});
const call = async (method, url, { json, form } = {}) => {
  const res = await fetch(service.url + url, {
    method, headers: { authorization: `Bearer ${auth.token(OWNER).token}`, ...(json ? { 'content-type': 'application/json' } : {}) }, body: json ? JSON.stringify(json) : form,
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  let body; try { body = JSON.parse(bytes.toString()); } catch { body = null; }
  if (res.status === 500) console.error(`500 from ${method} ${url}; the service said:\n${service.output().slice(-2500)}`); // the response hides the cause on purpose
  return { status: res.status, body, bytes, headers: res.headers };
};
const file = (field, buffer, name) => { const f = new FormData(); f.append(field, new Blob([buffer]), name); return f; };
const wipe = async () => {
  for (const m of ['payrollDeduction', 'payrollReward', 'payrollRecord', 'leave', 'attendance', 'shiftAssignment', 'staffDocument', 'staff', 'shift', 'staffTeam', 'staffRole']) await prisma[m].deleteMany();
};
const restart = async () => {
  await service.stop();
  await assert.rejects(fetch(`${service.url}/health`, { signal: AbortSignal.timeout(1000) }), 'the service is down');
  service = await start(); // a brand new process: nothing is in its memory
};

before(async () => {
  if (!db) return;
  auth = await startFakeAuthService({ secret, internalKey });
  settings = await startFakeSettingsService({ internalKey });
  shopId = settings.addShop(OWNER.accountId, 'Main Shop').id;
  port = await freePort();
  uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-staff-persist-'));
  process.env.REPOSITORY_DRIVER = 'prisma';
  process.env.STAFF_DATABASE_URL = db.url;
  ({ prisma } = require('../../repositories/prisma/client'));
  await wipe();
  service = await start();
});
after(async () => {
  if (!db) return;
  await service?.stop();
  await wipe();
  await prisma.$disconnect();
  await auth.stop();
  await settings.stop();
  fs.rmSync(uploads, { recursive: true, force: true });
});

test('staff, roster, files, attendance, leave and payroll are identical after the service is stopped and started again', { skip }, async () => {
  const perms = [{ module: 'Staff Management', view: true, add: true, edit: true, delete: false }];
  const role = (await call('POST', '/api/v1/roles', { json: { name: 'Cashier' } })).body.data;
  assert.equal((await call('PUT', `/api/v1/roles/${role.id}/permissions`, { json: { permissions: perms } })).status, 200);
  const team = (await call('POST', '/api/v1/teams', { json: { name: 'Front' } })).body.data;
  const shift = (await call('POST', '/api/v1/shifts', { json: { name: 'Day', startTime: '00:00', endTime: '23:59' } })).body.data;
  const body = {
    name: 'Kumari Perera ☕', gender: 'Female', phone: '071 555 1234', email: 'Kumari@PaiPos.com', nic: '1996 1234 5678', dob: '2001-04-21', address: 'Kandy',
    emergencyContact: { name: 'Nimal', relationship: 'Brother', phone: '071 123 4567' }, joinDate: '2025-05-01', roleId: role.id, teamId: team.id, employmentType: 'Fulltime',
    shiftId: shift.id, workingDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], hoursPerWeek: 40, username: 'Kumari', password: 'Abc@1234',
    salary: { type: 'Monthly', basic: 60000.5, overtime: true, otRate: 100, paymentMethod: 'Bank Transfer', bankName: 'BOC - Jaffna', accountNumber: '1234 4567 8910' },
    epf: { allowed: true, employerNumber: '123456/A', employeeNumber: '00789' },
  };
  const made = await call('POST', '/api/v1/staff', { json: body });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = made.body.data.id;
  assert.equal(made.body.data.code, 'STF0001');
  assert.equal((await call('POST', `/api/v1/staff/${id}/image`, { form: file('image', PNG, 'me.png') })).status, 200);
  assert.equal((await call('POST', `/api/v1/staff/${id}/documents/agreement`, { form: file('file', PDF, 'agreement.pdf') })).status, 200);
  assert.equal((await call('POST', '/api/v1/attendance/check-in', { json: { staffId: id } })).status, 201);
  assert.equal((await call('POST', '/api/v1/attendance/leaves', { json: { staffId: id, type: 'full_day', date: '2026-01-15', reason: 'Family event' } })).status, 201);
  const rec = await call('POST', '/api/v1/payroll/records', { json: { staffId: id, payDate: '2026-03-31' } });
  assert.equal(rec.status, 201, JSON.stringify(rec.body));
  assert.equal((await call('POST', '/api/v1/payroll/rewards', { json: { staffId: id, date: '2026-03-10', reason: 'Special Bonus', amount: 5000.5 } })).status, 201);
  assert.equal((await call('POST', '/api/v1/payroll/deductions', { json: { staffId: id, date: '2026-03-12', reason: 'Salary Advance', totalAmount: 9000, monthlyAmount: 3000.75 } })).status, 201);
  const paid = await call('POST', `/api/v1/payroll/records/${rec.body.data.id}/pay`);
  assert.equal(paid.status, 200, JSON.stringify(paid.body));

  const snapshot = async () => ({
    staff: (await call('GET', `/api/v1/staff/${id}`)).body,
    list: (await call('GET', '/api/v1/staff')).body,
    roles: (await call('GET', '/api/v1/roles')).body,
    teams: (await call('GET', '/api/v1/teams')).body,
    shifts: (await call('GET', '/api/v1/shifts')).body,
    roster: (await call('GET', '/api/v1/shifts/roster')).body,
    attendance: (await call('GET', `/api/v1/attendance/staff/${id}`)).body,
    leaves: (await call('GET', '/api/v1/attendance/leaves')).body,
    records: (await call('GET', '/api/v1/payroll/records')).body,
    record: (await call('GET', `/api/v1/payroll/records/${rec.body.data.id}`)).body,
    rewards: (await call('GET', '/api/v1/payroll/rewards')).body,
    deductions: (await call('GET', '/api/v1/payroll/deductions')).body,
  });
  const before = await snapshot();
  assert.equal(before.staff.data.salary.basic, 60000.5);
  assert.equal(before.records.data[0].status, 'Paid');
  assert.equal(before.records.data[0].netPay, 62000.25, 'net pay = basic 60000.50 + reward 5000.50 - monthly deduction 3000.75');

  await restart();

  const after = await snapshot();
  for (const key of Object.keys(before)) assert.deepEqual(after[key], before[key], `${key} is identical after the restart`);
  assert.equal(after.record.data.paidOn, before.record.data.paidOn, 'the paid time and the frozen figures survived');

  // files: the private picture and document are readable again, with the same bytes
  const pic = await call('GET', `/api/v1/staff/${id}/image`);
  assert.deepEqual([pic.status, pic.bytes.equals(PNG)], [200, true]);
  const doc = await call('GET', `/api/v1/staff/${id}/documents/agreement`);
  assert.deepEqual([doc.status, doc.bytes.equals(PDF)], [200, true]);

  // rules and counters keep working on the stored data
  const dup = await call('POST', '/api/v1/staff', { json: { ...body, username: 'Other', phone: '071 555 9999', nic: '1997 1234 5678' } }); // only the email is the same as the stored staff member
  assert.deepEqual([dup.status, dup.body.code], [409, 'DUPLICATE'], 'the stored email is still reserved');
  assert.equal((await call('POST', '/api/v1/attendance/check-in', { json: { staffId: id } })).status, 409, 'one check-in per day is still enforced');
  assert.equal((await call('POST', '/api/v1/payroll/records', { json: { staffId: id, payDate: '2026-03-15' } })).status, 409, 'one payroll record per staff member and month');
  assert.equal((await call('DELETE', `/api/v1/shifts/${shift.id}`)).status, 409, 'a shift that is in use cannot be deleted');
  assert.equal((await call('DELETE', `/api/v1/roles/${role.id}`)).status, 409, 'a role that is in use cannot be deleted');

  // reversible removal survives a restart too
  assert.equal((await call('DELETE', `/api/v1/staff/${id}`)).status, 200);
  await restart();
  assert.equal((await call('GET', `/api/v1/staff/${id}`)).status, 404, 'removed staff stay hidden');
  assert.equal((await call('GET', '/api/v1/staff')).body.data.length, 0);
  assert.equal((await call('POST', `/api/v1/staff/${id}/restore`)).status, 200);
  assert.equal((await call('GET', `/api/v1/staff/${id}`)).body.data.code, 'STF0001', 'the same code comes back');
});

test('service output never contains the database password or the keys', { skip }, () => {
  const out = service.output();
  assert.match(out, /Staff Service listening/);
  for (const s of [db.connection.password, secret, internalKey]) assert.ok(!out.includes(s));
});
