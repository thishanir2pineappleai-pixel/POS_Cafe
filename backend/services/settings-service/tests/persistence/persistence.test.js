// Restart persistence: the Settings Service runs as a REAL process on MySQL (Prisma), data is written through the HTTP API,
// the process is stopped and started again, and the data must still be there. Needs SETTINGS_TEST_DATABASE_URL (a database
// whose name ends in _test, already migrated: pnpm --filter @pos-cafe/settings-service db:migrate:deploy). Without it the
// test is SKIPPED and says so. The stand-in Auth Service provides real signed tokens.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { testDatabase } = require('@pos-cafe/shared/testing/database');
const { startFakeAuthService } = require('@pos-cafe/shared/testing/fakeAuthService');
const { startServiceProcess, freePort } = require('@pos-cafe/shared/testing/serviceProcess');

const db = testDatabase('SETTINGS_TEST_DATABASE_URL');
const SERVICE_DIR = path.resolve(__dirname, '../..');
const secret = crypto.randomBytes(24).toString('hex');
const internalKey = crypto.randomBytes(24).toString('hex');
const OWNER = { userId: 7, accountId: 31, role: 'owner' };
const TZ = '(GMT +05:30) India / Colombo';

let auth; let port; let service; let prisma;
const start = () => startServiceProcess({
  serviceDir: SERVICE_DIR,
  port,
  env: {
    REPOSITORY_DRIVER: 'prisma', SETTINGS_DATABASE_URL: db.url, SETTINGS_SERVICE_PORT: String(port), HOST: '127.0.0.1',
    JWT_SECRET: secret, INTERNAL_SERVICE_KEY: internalKey, AUTH_SERVICE_URL: auth.url, UPLOADS_DIR: path.join(require('node:os').tmpdir(), `pos-settings-persist-${port}`),
  },
});
const call = async (method, url, { json, headers = {} } = {}) => {
  const res = await fetch(service.url + url, { method, headers: { ...(json ? { 'content-type': 'application/json' } : {}), ...headers }, body: json ? JSON.stringify(json) : undefined });
  return { status: res.status, body: await res.json() };
};
const bearer = () => ({ authorization: `Bearer ${auth.token(OWNER).token}` });
const internal = { 'x-internal-key': internalKey };

before(async () => {
  if (!db) return;
  auth = await startFakeAuthService({ secret, internalKey });
  port = await freePort();
  process.env.REPOSITORY_DRIVER = 'prisma';
  process.env.SETTINGS_DATABASE_URL = db.url;
  ({ prisma } = require('../../repositories/prisma/client'));
  await prisma.shopProfile.deleteMany({ where: { accountId: { in: [31, 32] } } });
  service = await start();
});
after(async () => {
  if (!db) return;
  await service?.stop();
  await prisma.shopProfile.deleteMany({ where: { accountId: { in: [31, 32] } } });
  await prisma.$disconnect();
  await auth.stop();
});

test('shops written through the API are still there after the service is stopped and started again', { skip: db ? false : 'SETTINGS_TEST_DATABASE_URL is not set: persistence was NOT tested' }, async () => {
  const made = await call('POST', '/api/v1/settings/shops', { headers: bearer(), json: { name: 'Persistent Café ☕', address: 'Jaffna', phone: '0711234567', timezone: TZ, email: 'p@poscafe.com' } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = made.body.data.id;
  assert.equal((await call('PUT', `/api/v1/settings/shops/${id}`, { headers: bearer(), json: { name: 'Persistent Café ☕ (edited)', address: 'Colombo', phone: '0711234567', timezone: TZ } })).status, 200);
  const first = await call('PUT', '/internal/accounts/32/first-shop', { headers: internal, json: { ownerId: 9, name: 'First Shop', address: 'Kandy', phone: '0777777777' } });
  assert.equal(first.status, 200);
  const before = (await call('GET', '/api/v1/settings/shops', { headers: bearer() })).body.data;
  assert.equal(before.length, 1);

  await service.stop(); // the process really ends
  await assert.rejects(fetch(`${service.url}/health`, { signal: AbortSignal.timeout(1000) }), 'the service is down');
  service = await start(); // a brand new process: nothing is in its memory

  const after = (await call('GET', '/api/v1/settings/shops', { headers: bearer() })).body.data;
  assert.deepEqual(after, before, 'the shop list is identical after the restart');
  assert.equal(after[0].name, 'Persistent Café ☕ (edited)');
  assert.equal(after[0].email, null, 'the cleared optional field stayed cleared');
  assert.deepEqual((await call('GET', '/internal/accounts/32/shops', { headers: internal })).body.data, [{ id: first.body.data.id, name: 'First Shop', timezone: null }]);
  const retry = await call('PUT', '/internal/accounts/32/first-shop', { headers: internal, json: { ownerId: 9, name: 'Another', address: 'x', phone: '1' } });
  assert.deepEqual(retry.body.data, first.body.data, 'first-shop is still idempotent after a restart: no second shop');
  assert.equal(await prisma.shopProfile.count({ where: { accountId: 32 } }), 1);
  assert.equal((await call('GET', '/api/v1/settings/shops/' + id, { headers: { authorization: `Bearer ${auth.token({ userId: 8, accountId: 99, role: 'owner' }).token}` } })).status, 404, 'another account still cannot see it');
});

test('the service started on MySQL answers requests with the same API as in memory mode', { skip: db ? false : 'SETTINGS_TEST_DATABASE_URL is not set' }, async () => {
  const bad = await call('POST', '/api/v1/settings/shops', { headers: bearer(), json: {} });
  assert.deepEqual([bad.status, bad.body.code], [400, 'VALIDATION_ERROR']);
  assert.equal((await call('GET', '/api/v1/settings/shops/999999', { headers: bearer() })).status, 404);
  assert.match(service.output(), /Settings Service listening/);
  assert.ok(!service.output().includes(db.connection.password), 'the database password is never printed');
});
