// Restart persistence: the Sales Service runs as a REAL process on MySQL (Prisma), orders and discount applications are written
// through the HTTP API, the process is stopped and started again, and everything must still be there. Needs
// SALES_TEST_DATABASE_URL (a database whose name ends in _test, already migrated: pnpm --filter @pos-cafe/sales-service
// db:migrate:deploy). Without it the tests are SKIPPED and say so. Stand-ins provide the Auth, Settings and Menu services.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { testDatabase } = require('@pos-cafe/shared/testing/database');
const { startFakeAuthService } = require('@pos-cafe/shared/testing/fakeAuthService');
const { startFakeSettingsService } = require('@pos-cafe/shared/testing/fakeSettingsService');
const { startFakeMenuService } = require('@pos-cafe/shared/testing/fakeMenuService');
const { startServiceProcess, freePort } = require('@pos-cafe/shared/testing/serviceProcess');

const db = testDatabase('SALES_TEST_DATABASE_URL');
const SERVICE_DIR = path.resolve(__dirname, '../..');
const secret = crypto.randomBytes(24).toString('hex');
const internalKey = crypto.randomBytes(24).toString('hex');
const OWNER = { userId: 7, accountId: 41, role: 'owner' };
const skip = db ? false : 'SALES_TEST_DATABASE_URL is not set: persistence was NOT tested';

let auth; let settings; let menu; let port; let service; let prisma;
const start = () => startServiceProcess({
  serviceDir: SERVICE_DIR,
  port,
  env: {
    REPOSITORY_DRIVER: 'prisma', SALES_DATABASE_URL: db.url, SALES_SERVICE_PORT: String(port), HOST: '127.0.0.1',
    JWT_SECRET: secret, INTERNAL_SERVICE_KEY: internalKey, AUTH_SERVICE_URL: auth.url, SETTINGS_SERVICE_URL: settings.url, MENU_SERVICE_URL: menu.url,
    UPLOADS_DIR: path.join(os.tmpdir(), `pos-sales-persist-${port}`),
  },
});
const call = async (method, url, { json, token = auth.token(OWNER).token } = {}) => {
  const res = await fetch(service.url + url, { method, headers: { authorization: `Bearer ${token}`, ...(json ? { 'content-type': 'application/json' } : {}) }, body: json ? JSON.stringify(json) : undefined });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
};
const wipe = async () => {
  const where = { accountId: { in: [41, 42] } };
  await prisma.payment.deleteMany({ where });
  await prisma.orderItem.deleteMany({ where: { order: where } });
  await prisma.order.deleteMany({ where });
  await prisma.discountApplicationProduct.deleteMany({ where: { application: where } });
  await prisma.discountApplication.deleteMany({ where });
};

before(async () => {
  if (!db) return;
  auth = await startFakeAuthService({ secret, internalKey });
  settings = await startFakeSettingsService({ internalKey });
  menu = await startFakeMenuService({ internalKey });
  settings.addShop(41, 'Persistent Cafe');
  settings.addShop(42, 'Other Cafe');
  menu.addProduct(1, 'Latte', 250.5);
  menu.addProduct(2, 'Muffin', 180);
  menu.addDiscount(1, 'Ten', 10);
  port = await freePort();
  process.env.REPOSITORY_DRIVER = 'prisma';
  process.env.SALES_DATABASE_URL = db.url;
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
  await menu.stop();
});

test('orders and discount applications written through the API are still there, identical, after a restart', { skip }, async () => {
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const app = await call('POST', '/api/v1/discounts/applications', { json: { discountId: 1, startDate: iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)), endDate: iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)), appliesToAll: false, productIds: [1] } });
  assert.equal(app.status, 201, JSON.stringify(app.body));

  const created = await call('POST', '/api/v1/orders', { json: { type: 'Dine-In', customerName: 'Persistent ☕', tableLabel: 'T9', items: [{ productId: 1, quantity: 3 }, { productId: 2, quantity: 1 }] } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const order = created.body.data;
  assert.deepEqual([order.subtotal, order.discountTotal, order.total], [931.5, 75.15, 856.35], 'priced in cents: 3 x 250.50 + 180, 10% off the latte line');
  const edited = await call('PUT', `/api/v1/orders/${order.id}`, { json: { type: 'Take Away', customerName: 'Persistent ☕ (edited)', items: [{ productId: 2, quantity: 2 }] } });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));

  const snapshot = async () => ({
    order: (await call('GET', `/api/v1/orders/${order.id}`)).body.data,
    list: (await call('GET', '/api/v1/orders')).body,
    applications: (await call('GET', '/api/v1/discounts/applications')).body,
    summary: (await call('GET', '/api/v1/reports/sales/summary')).body.data,
    csv: await fetch(`${service.url}/api/v1/orders/export`, { headers: { authorization: `Bearer ${auth.token(OWNER).token}` } }).then((r) => r.text()),
  });
  assert.equal((await call('PATCH', `/api/v1/orders/${order.id}/status`, { json: { status: 'Preparing' } })).status, 200);
  assert.equal((await call('PATCH', `/api/v1/orders/${order.id}/status`, { json: { status: 'Delivered' } })).status, 200);
  const paid = await call('POST', `/api/v1/orders/${order.id}/payments`, { json: { method: 'Card' } });
  assert.equal(paid.status, 201, JSON.stringify(paid.body));
  assert.deepEqual([paid.body.data.status, paid.body.data.payment.method, paid.body.data.payment.amount], ['Paid', 'Card', 360]);

  const before = await snapshot();
  assert.deepEqual([before.order.status, before.order.total, before.order.payment.amount], ['Paid', 360, 360]);
  assert.equal(before.summary.totalOrders, 1);

  await service.stop(); // the process really ends
  await assert.rejects(fetch(`${service.url}/health`, { signal: AbortSignal.timeout(1000) }), 'the service is down');
  service = await start(); // a brand new process: nothing is in its memory

  assert.deepEqual(await snapshot(), before, 'orders, list, applications, summary and CSV are identical after the restart');
  assert.equal(await prisma.order.count({ where: { accountId: 41 } }), 1);
  assert.equal(await prisma.orderItem.count({ where: { orderId: order.id } }), 1, 'the edit replaced the lines in the database too');
  const row = await prisma.order.findUnique({ where: { id: order.id } });
  assert.equal(String(row.total), '360', 'the total is stored as DECIMAL, not a float');
  const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
  assert.deepEqual([payment.method, String(payment.amount), payment.recordedBy, payment.accountId], ['Card', '360', 7, 41], 'the payment row persisted');
  assert.equal((await call('POST', `/api/v1/orders/${order.id}/payments`, { json: { method: 'Cash' } })).status, 409, 'still paid after the restart: no second payment');
  assert.equal(await prisma.payment.count({ where: { orderId: order.id } }), 1);
  assert.equal((await call('GET', `/api/v1/orders/${order.id}`, { token: auth.token({ userId: 8, accountId: 42, role: 'owner' }).token })).status, 404, 'another account still cannot see it');
});

test('the service started on MySQL answers requests with the same API as in memory mode', { skip }, async () => {
  const bad = await call('POST', '/api/v1/orders', { json: {} });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.success, false);
  assert.equal((await fetch(`${service.url}/api/v1/orders`)).status, 401);
});
