// Staff Management through the REAL Gateway route table, in front of the real Auth, Settings and Staff services running
// together in this process (one shared JWT secret and internal key). Environment values are set before the services load.
process.env.JWT_SECRET = 'j'.repeat(48);
process.env.INTERNAL_SERVICE_KEY = 'k'.repeat(48);
process.env.MESSAGE_DELIVERY = 'dev-outbox';
const os = require('node:os');
const nodeFs = require('node:fs');
const nodePath = require('node:path');
// Uploads of this test go to a temporary folder (UPLOADS_DIR), never into a service's real upload folder.
const uploadsTmp = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'pos-cafe-gateway-test-'));
process.env.UPLOADS_DIR = uploadsTmp;

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { once } = require('node:events');
const { createApp: createGateway } = require('../app');
const { config } = require('../config');
const { createApp: createAuth } = require('../../services/auth-service/app');
const authSettingsClient = require('../../services/auth-service/services/integration/settingsClient');
const { createApp: createSettings } = require('../../services/settings-service/app');
const { createApp: createStaff } = require('../../services/staff-service/app');
const staffAuthClient = require('../../services/staff-service/services/integration/authClient');
const staffSettingsClient = require('../../services/staff-service/services/integration/settingsClient');
const staffUploads = require('../../services/staff-service/config').uploads;

const servers = [];
const listen = async (app) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  return { server, url: `http://127.0.0.1:${server.address().port}` };
};
const stop = (s) => new Promise((resolve) => { s.closeAllConnections(); s.close(resolve); });
after(async () => {
  for (const s of servers) await stop(s);
  nodeFs.rmSync(uploadsTmp, { recursive: true, force: true }); // only the temporary folder this test created
});

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const png = () => { const f = new FormData(); f.append('image', new Blob([PNG]), 'x.png'); return f; };

async function startAll() {
  const auth = await listen(createAuth());
  const settings = await listen(createSettings({ authBaseUrl: auth.url }));
  const staff = await listen(createStaff());
  authSettingsClient.useBaseUrl(settings.url);
  staffAuthClient.useBaseUrl(auth.url);
  staffSettingsClient.useBaseUrl(settings.url);
  const target = (name) => ({ 'auth-service': auth.url, 'settings-service': settings.url, 'staff-service': staff.url })[name] ?? 'http://127.0.0.1:1';
  const gateway = await listen(createGateway({ ...config, rateLimitPerMinute: 10000, routes: config.routes.map((r) => ({ ...r, target: target(r.name) })) }));
  return { auth, settings, staff, gw: gateway.url };
}

const call = async (base, method, url, { json, form, token } = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: { ...(json ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: json ? JSON.stringify(json) : form,
  });
  const bytes = Buffer.from(await res.arrayBuffer());
  let body; try { body = JSON.parse(bytes.toString()); } catch { body = null; }
  return { status: res.status, body, headers: res.headers, bytes };
};

let phoneCounter = 20;
async function signUp(gw, auth, email) {
  const post = (p, json) => call(gw, 'POST', `/api/v1/auth/signup${p}`, { json });
  const outbox = async () => (await call(auth.url, 'GET', '/api/v1/dev/outbox')).body.data;
  const code = async (channel, to) => [...await outbox()].reverse().find((m) => m.channel === channel && m.to === to && /\b\d{6}\b/.test(m.text)).text.match(/\b(\d{6})\b/)[1];
  phoneCounter += 1;
  const phone = `+94 71 234 56${phoneCounter}`;
  const t = (await post('/credentials', { email, username: 'Owner', password: 'Abc@1234', acceptTerms: true })).body.data.registrationToken;
  await post('/email/verify', { registrationToken: t, code: await code('email', email) });
  await post('/owner', { registrationToken: t, ownerName: 'Staff Owner', phone });
  await post('/phone/verify', { registrationToken: t, code: await code('sms', phone) });
  await post('/business', { registrationToken: t, businessName: 'STAFF CAFE', address: 'Jaffna' });
  const accessKey = [...await outbox()].reverse().find((m) => m.to === email && /[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}/.test(m.text)).text.match(/[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}/)[0];
  assert.equal((await post('/activate', { email, accessKey })).status, 200);
  const login = await call(gw, 'POST', '/api/v1/auth/login', { json: { email, password: 'Abc@1234' } });
  assert.equal(login.status, 200);
  return login.body.data.token;
}

test('staff, roles, shifts, attendance, payroll and private pictures work through the Gateway, scoped to the signed-up shop', async () => {
  const { auth, gw } = await startAll();
  const token = await signUp(gw, auth, 'staff@poscafe.com'); // the Settings Service now holds shop 1 of this account
  for (const url of ['/api/v1/staff', '/api/v1/roles', '/api/v1/shifts', '/api/v1/attendance', '/api/v1/payroll/records']) {
    assert.equal((await call(gw, 'GET', url)).status, 401, `${url} needs a token`);
    assert.equal((await call(gw, 'GET', url, { token })).status, 200, url);
  }
  const role = (await call(gw, 'POST', '/api/v1/roles', { token, json: { name: 'Cashier' } })).body.data;
  const team = (await call(gw, 'POST', '/api/v1/teams', { token, json: { name: 'Front' } })).body.data;
  const shift = (await call(gw, 'POST', '/api/v1/shifts', { token, json: { name: 'Day', startTime: '00:00', endTime: '23:59' } })).body.data;
  const body = {
    name: 'Kumari Perera', gender: 'Female', phone: '071 555 1234', email: 'kumari@paipos.com', nic: '1996 1234 5678', dob: '2001-04-21', address: 'Kandy',
    emergencyContact: { name: 'Nimal', relationship: 'Brother', phone: '071 123 4567' }, joinDate: '2025-05-01', roleId: role.id, teamId: team.id,
    employmentType: 'Fulltime', shiftId: shift.id, workingDays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], hoursPerWeek: 40, username: 'kumari', password: 'Abc@1234',
    salary: { type: 'Monthly', basic: 60000, overtime: false, paymentMethod: 'Cash' },
  };
  const made = await call(gw, 'POST', '/api/v1/staff', { token, json: body });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.data.code, 'STF0001');
  assert.ok(!JSON.stringify(made.body).includes('Abc@1234') && !/hash|scrypt/i.test(JSON.stringify(made.body)), 'no password data in the response');
  const id = made.body.data.id;

  assert.equal((await call(gw, 'POST', '/api/v1/attendance/check-in', { token, json: { staffId: id } })).status, 201);
  assert.equal((await call(gw, 'GET', '/api/v1/attendance/summary', { token })).body.data.present, 1);
  const rec = await call(gw, 'POST', '/api/v1/payroll/records', { token, json: { staffId: id, payDate: '2099-01-31' } });
  assert.equal(rec.status, 201, JSON.stringify(rec.body));
  assert.equal((await call(gw, 'GET', '/api/v1/payroll/summary', { token })).status, 200);

  // the picture is private: uploaded through the Gateway, readable only with a token, never served statically
  const pic = await call(gw, 'POST', `/api/v1/staff/${id}/image`, { token, form: png() });
  assert.equal(pic.status, 200, JSON.stringify(pic.body));
  assert.equal((await call(gw, 'GET', `/api/v1/staff/${id}/image`)).status, 401);
  const got = await call(gw, 'GET', `/api/v1/staff/${id}/image`, { token });
  assert.deepEqual([got.status, got.headers.get('content-type')], [200, 'image/png']);
  assert.equal((await call(gw, 'GET', '/uploads/staff')).status, 404, 'no static route to the private folder');

  // another account sees none of it
  const rival = await signUp(gw, auth, 'rival@poscafe.com');
  assert.deepEqual((await call(gw, 'GET', '/api/v1/staff', { token: rival })).body.data, []);
  assert.equal((await call(gw, 'GET', `/api/v1/staff/${id}`, { token: rival })).status, 404);
  assert.equal((await call(gw, 'GET', `/api/v1/staff/${id}/image`, { token: rival })).status, 404);

  // logout in the Auth Service is felt by the Staff Service at once
  assert.equal((await call(gw, 'POST', '/api/v1/auth/logout', { token })).status, 200);
  assert.equal((await call(gw, 'GET', '/api/v1/staff', { token })).status, 401);
});

test('a stopped Staff Service is a clean 503 through the Gateway, and the Gateway reports it', async () => {
  const { auth, staff, gw } = await startAll();
  const token = await signUp(gw, auth, 'down2@poscafe.com');
  await stop(staff.server);
  const down = await call(gw, 'GET', '/api/v1/staff', { token });
  assert.deepEqual([down.status, down.body.code], [503, 'SERVICE_UNAVAILABLE']);
  const health = await call(gw, 'GET', '/health/services');
  assert.equal(health.status, 503);
  assert.equal(health.body.data.services['staff-service'], 'unreachable');
});
