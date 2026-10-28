// Tests of the frontend's non-visual logic: the request client (token, expiry, query strings) and the staff form <-> API mapper.
// Run with: pnpm --filter @pos-cafe/frontend test   (no browser and no server needed: fetch is replaced by a stub)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configureClient, request, requestPage } from '../src/api/client.js';
import { ApiError, attempt } from '../src/api/errorHandler.js';
import { createBody, fromApi, patchBody, statusChanged } from '../src/pages/StaffManagement/staffMapper.js';
import { blankStaff } from '../src/pages/StaffManagement/staffConstants.js';

// Replaces fetch for one test: `reply(url, init)` returns { status, body }. Records every call.
function stubFetch(reply) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    const { status = 200, body } = reply(url, init);
    return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body };
  };
  return calls;
}
const success = (data, extra = {}) => ({ body: { success: true, data, ...extra } });

test('the client sends the session token, drops empty query values, and returns the data', async () => {
  const calls = stubFetch(() => success([1, 2]));
  configureClient({ getToken: () => 'T0KEN', onExpired: () => {} });
  const data = await request('GET', '/orders', { query: { from: '2026-01-01', search: '', page: 2, x: undefined } });
  assert.deepEqual(data, [1, 2]);
  assert.ok(calls[0].url.endsWith('/orders?from=2026-01-01&page=2'), calls[0].url);
  assert.equal(calls[0].init.headers.authorization, 'Bearer T0KEN');
});

test('a page request returns the data together with the paging meta', async () => {
  stubFetch(() => success([{ id: 1 }], { meta: { total: 1, page: 1, limit: 10, totalPages: 1 } }));
  const page = await requestPage('GET', '/products');
  assert.deepEqual([page.data.length, page.meta.total], [1, 1]);
});

test('a 401 on a signed-in call ends the session; a 401 from an explicit-token or token:null call does not', async () => {
  let expired = 0;
  configureClient({ getToken: () => 'T0KEN', onExpired: () => { expired += 1; } });
  stubFetch(() => ({ status: 401, body: { success: false, code: 'UNAUTHORIZED', message: 'Authentication required' } }));
  await assert.rejects(request('GET', '/orders'), (err) => err instanceof ApiError && err.status === 401);
  assert.equal(expired, 1, 'a signed-in call that gets 401 reports the session as ended');
  await assert.rejects(request('POST', '/auth/login', { json: {}, token: null }));
  await assert.rejects(request('GET', '/auth/me', { token: 'OTHER' }));
  assert.equal(expired, 1, 'login (token: null) and an explicit token never end the session');
});

test('login-style calls send no Authorization header even while a session exists', async () => {
  configureClient({ getToken: () => 'T0KEN', onExpired: () => {} });
  const calls = stubFetch(() => success({}));
  await request('POST', '/auth/login', { json: { email: 'a-b.c' }, token: null });
  assert.equal(calls[0].init.headers.authorization, undefined);
});

test('attempt() turns failures into { ok: false, error, fields } and names the fields of a validation failure', async () => {
  configureClient({ getToken: () => null, onExpired: () => {} });
  stubFetch(() => ({ status: 400, body: { success: false, code: 'VALIDATION_ERROR', message: 'Validation failed', errors: [{ field: 'categoryId', message: 'Required' }] } }));
  const result = await attempt(() => request('POST', '/products', { json: {} }));
  assert.equal(result.ok, false);
  assert.deepEqual(result.fields, { categoryId: 'Required' });
  assert.match(result.error, /Validation failed \(categoryId: Required\)/);
  stubFetch(() => success({ id: 7 }));
  assert.deepEqual(await attempt(() => request('GET', '/x')), { ok: true, data: { id: 7 } });
});

test('attempt() reports an unreachable server in plain words', async () => {
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  const result = await attempt(() => request('GET', '/orders'));
  assert.equal(result.ok, false);
  assert.match(result.error, /Cannot reach the server/);
});

const LISTS = { roles: [{ id: 1, name: 'Manager' }, { id: 2, name: 'Chef' }], teams: [{ id: 3, name: 'Management' }], shifts: [{ id: 4, name: 'Morning' }] };
const apiStaff = {
  id: 9, code: 'STF0009', name: 'Michel Brown', image: null, role: { id: 1, name: 'Manager' }, team: { id: 3, name: 'Management' }, shift: { id: 4, name: 'Morning' },
  phone: '0711234567', email: 'michel-brown', lastLogin: null, status: 'Active', active: true, gender: 'Male', nic: '199012345678', dob: '1990-05-01', address: '478 Kandy',
  emergencyContact: { name: 'Robert', relationship: 'Brother', phone: '0711234568' },
  employment: { joinDate: '2026-01-05', employmentType: 'Fulltime', inactiveReason: null, workingDays: ['mon', 'tue', 'wed'], hoursPerWeek: 40, username: 'michel' },
  salary: { type: 'Monthly', basic: 60000, overtime: true, otRate: 150, paymentMethod: 'Bank Transfer', bankName: 'BOC', accountNumber: '3500' },
  epf: { allowed: true, employerNumber: '123456/A', employeeNumber: '00701', employeeRate: 8, employerRate: 12, etfRate: 3 },
  documents: { cv: { fileName: 'cv.pdf', type: 'pdf', size: 10, uploadedAt: 'x' }, idCopy: null, agreement: null },
};

test('staff: API -> form uses names, DD/MM/YYYY dates and capitalised days', () => {
  const f = fromApi(apiStaff);
  assert.deepEqual([f.role, f.team, f.shift, f.dob, f.joinDate, f.workingDays, f.hoursPerWeek], ['Manager', 'Management', 'Morning', '01/05/1990', '05/01/2026', ['Mon', 'Tue', 'Wed'], '40']);
  assert.deepEqual([f.salary.basic, f.salary.method, f.epf.employerNumber, f.hasRecords, f.docs.cv.name, f.docs.idCopy], [60000, 'Bank Transfer', '123456/A', true, 'cv.pdf', null]);
});

test('staff: a non-owner record (no salary, EPF or documents) maps to blank record fields', () => {
  const { salary, epf, documents, ...plain } = apiStaff;
  const f = fromApi(plain);
  assert.equal(f.hasRecords, false);
  assert.deepEqual(f.salary, blankStaff().salary);
  assert.deepEqual(f.docs, { cv: null, idCopy: null, agreement: null });
});

test('staff: form -> create body sends ids, ISO dates, lowercase days and a clean NIC', () => {
  const f = fromApi(apiStaff);
  Object.assign(f, { password: 'Str0ng!Pass1', nic: '1990 1234 5678', salary: { ...f.salary, basic: '60,000.00', otRate: '150' } });
  const body = createBody(f, LISTS, { withRecords: true });
  assert.deepEqual([body.roleId, body.teamId, body.shiftId, body.dob, body.joinDate, body.workingDays, body.hoursPerWeek], [1, 3, 4, '1990-05-01', '2026-01-05', ['mon', 'tue', 'wed'], 40]);
  assert.equal(body.nic, '199012345678');
  assert.deepEqual([body.salary.basic, body.salary.otRate, body.salary.paymentMethod, body.salary.bankName], [60000, 150, 'Bank Transfer', 'BOC']);
  assert.equal(body.password, 'Str0ng!Pass1');
  assert.equal(body.inactiveReason, undefined, 'an active member sends no reason');
});

test('staff: without the owner role no salary, EPF or documents are sent', () => {
  const f = fromApi(apiStaff);
  f.password = 'Str0ng!Pass1';
  const body = createBody(f, LISTS, { withRecords: false });
  assert.equal(body.salary, undefined);
  assert.equal(body.epf, undefined);
  assert.equal(patchBody(f, LISTS, { withRecords: false }).salary, undefined);
  assert.equal(patchBody(f, LISTS, { withRecords: false }).password, undefined, 'an edit never sends the password');
});

test('staff: cash payment sends no bank fields; no overtime sends no OT rate; EPF not allowed sends no numbers', () => {
  const f = fromApi(apiStaff);
  f.salary = { ...f.salary, method: 'Cash', overtime: false };
  f.epf = { ...f.epf, allowed: false };
  const { salary, epf } = patchBody(f, LISTS, { withRecords: true });
  assert.deepEqual(Object.keys(salary).sort(), ['basic', 'overtime', 'paymentMethod', 'type']);
  assert.equal(epf.employerNumber, undefined);
  assert.equal(epf.allowed, false);
});

test('staff: the status is its own call; it is needed when the toggle or the reason changed', () => {
  const before = fromApi(apiStaff);
  assert.equal(statusChanged(before, { ...before }), false);
  assert.equal(statusChanged(before, { ...before, active: false, inactiveReason: 'On leave' }), true);
  const inactive = { ...before, active: false, inactiveReason: 'On leave' };
  assert.equal(statusChanged(inactive, { ...inactive, inactiveReason: 'Resigned' }), true);
});
