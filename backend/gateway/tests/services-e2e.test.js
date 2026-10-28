// The real Gateway routes (gateway/config.js) in front of the REAL Auth Service and Settings Service, running together in
// this process with one shared JWT secret and internal key. Proves the cross-service flows: signup creates the first shop
// in the Settings Service, the Settings Service accepts a token only while the Auth Service says the session is active,
// and a missing service fails closed. Environment values are set before the services are loaded (they read them once).
process.env.JWT_SECRET = 'j'.repeat(48);
process.env.INTERNAL_SERVICE_KEY = 'k'.repeat(48);
process.env.MESSAGE_DELIVERY = 'dev-outbox';
process.env.MENU_REQUIRE_AUTH = 'true';
const os = require('node:os');
const nodeFs = require('node:fs');
const nodePath = require('node:path');
// Uploads of this test go to a temporary folder (UPLOADS_DIR), never into a service's real upload folder.
const uploadsTmp = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'pos-cafe-gateway-test-'));
process.env.UPLOADS_DIR = uploadsTmp;

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { createApp: createGateway } = require('../app');
const { config } = require('../config');
const { createApp: createAuth } = require('../../services/auth-service/app');
const authUploads = require('../../services/auth-service/config').uploads;
const settingsClient = require('../../services/auth-service/services/integration/settingsClient');
const { createApp: createSettings } = require('../../services/settings-service/app');
const settingsUploads = require('../../services/settings-service/config').uploads;
const { createApp: createMenu } = require('../../services/menu-service/app');
const { createApp: createStaff } = require('../../services/staff-service/app');
const staffAuthClient = require('../../services/staff-service/services/integration/authClient');
const staffSettingsClient = require('../../services/staff-service/services/integration/settingsClient');
const staffUploads = require('../../services/staff-service/config').uploads;
const menuUploads = require('../../services/menu-service/config').uploads;
const { createApp: createSales } = require('../../services/sales-service/app');
const salesAuthClient = require('../../services/sales-service/services/integration/authClient');
const salesSettingsClient = require('../../services/sales-service/services/integration/settingsClient');
const salesMenuClient = require('../../services/sales-service/services/integration/menuClient');

const servers = [];
const listen = async (app) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  return { server, url: `http://127.0.0.1:${server.address().port}` };
};
const stop = (s) => new Promise((resolve) => { s.closeAllConnections(); s.close(resolve); });
const created = new Set(); // names of uploaded files (kept for readability of the assertions)
after(async () => {
  for (const s of servers) await stop(s);
  nodeFs.rmSync(uploadsTmp, { recursive: true, force: true }); // only the temporary folder this test created
});

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const png = () => { const f = new FormData(); f.append('image', new Blob([PNG]), 'x.png'); return f; };

async function startAll() {
  const auth = await listen(createAuth());
  const settings = await listen(createSettings({ authBaseUrl: auth.url }));
  const menu = await listen(createMenu({ authBaseUrl: auth.url }));
  const staff = await listen(createStaff());
  const sales = await listen(createSales());
  salesAuthClient.useBaseUrl(auth.url);
  salesSettingsClient.useBaseUrl(settings.url);
  salesMenuClient.useBaseUrl(menu.url);
  staffAuthClient.useBaseUrl(auth.url);
  staffSettingsClient.useBaseUrl(settings.url);
  settingsClient.useBaseUrl(settings.url);
  // The real route table, pointed at the test servers.
  const target = (name) => ({ 'auth-service': auth.url, 'settings-service': settings.url, 'menu-service': menu.url, 'staff-service': staff.url, 'sales-service': sales.url })[name];
  const gateway = await listen(createGateway({ ...config, rateLimitPerMinute: 10000, routes: config.routes.map((r) => ({ ...r, target: target(r.name) })) }));
  return { auth, settings, menu, staff, sales, gw: gateway.url };
}

const call = async (base, method, url, { json, form, token } = {}) => {
  const res = await fetch(base + url, {
    method,
    headers: { ...(json ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: json ? JSON.stringify(json) : form,
  });
  const text = Buffer.from(await res.arrayBuffer());
  let body; try { body = JSON.parse(text.toString()); } catch { body = null; }
  return { status: res.status, body, headers: res.headers, bytes: text };
};

let phoneCounter = 0; // every owner needs a phone number nobody else has used
async function signUp(gw, auth, email = 'e2e@poscafe.com') {
  const post = (p, json) => call(gw, 'POST', `/api/v1/auth/signup${p}`, { json });
  const outbox = async () => (await call(auth.url, 'GET', '/api/v1/dev/outbox')).body.data;
  const code = async (channel, to) => [...await outbox()].reverse().find((m) => m.channel === channel && m.to === to && /\b\d{6}\b/.test(m.text)).text.match(/\b(\d{6})\b/)[1];
  phoneCounter += 1;
  const phone = `+94 71 234 56${String(phoneCounter).padStart(2, '0')}`;
  const t = (await post('/credentials', { email, username: 'E2E', password: 'Abc@1234', acceptTerms: true })).body.data.registrationToken;
  await post('/email/verify', { registrationToken: t, code: await code('email', email) });
  await post('/owner', { registrationToken: t, ownerName: 'E2E Owner', phone });
  await post('/phone/verify', { registrationToken: t, code: await code('sms', phone) });
  await post('/business', { registrationToken: t, businessName: 'E2E CAFE', address: 'Jaffna' });
  const accessKey = [...await outbox()].reverse().find((m) => m.to === email && /[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}/.test(m.text)).text.match(/[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}/)[0];
  assert.equal((await post('/activate', { email, accessKey })).status, 200);
  const login = await call(gw, 'POST', '/api/v1/auth/login', { json: { email, password: 'Abc@1234' } });
  assert.equal(login.status, 200);
  return login.body.data.token;
}

test('signup creates the first shop in the Settings Service; shops, logos, admins and sessions work through the Gateway', async () => {
  const { auth, gw } = await startAll();
  const token = await signUp(gw, auth);

  const me = await call(gw, 'GET', '/api/v1/auth/me', { token });
  assert.deepEqual(me.body.data.shops, [{ id: 1, name: 'E2E CAFE' }], 'the Auth Service lists shops by asking the Settings Service');

  const shops = await call(gw, 'GET', '/api/v1/settings/shops', { token });
  assert.deepEqual([shops.status, shops.body.data.map((s) => [s.name, s.address, s.timezone])], [200, [['E2E CAFE', 'Jaffna', null]]], 'routed to the Settings Service');
  assert.equal((await call(gw, 'GET', '/api/v1/settings/timezones', { token })).body.data.length, 5);

  const second = await call(gw, 'POST', '/api/v1/settings/shops', { token, json: { name: 'Second', address: 'Colombo', phone: '0711234567', timezone: '(GMT +05:30) India / Colombo' } });
  assert.equal(second.status, 201);
  assert.equal((await call(gw, 'GET', '/api/v1/auth/me', { token })).body.data.shops.length, 2);

  // a logo goes to the Settings Service and is served back through the Gateway
  const logo = await call(gw, 'POST', `/api/v1/settings/shops/${second.body.data.id}/image`, { token, form: png() });
  assert.equal(logo.status, 200, JSON.stringify(logo.body));
  created.add(path.basename(logo.body.data.image));
  const served = await call(gw, 'GET', logo.body.data.image);
  assert.deepEqual([served.status, served.headers.get('content-type')], [200, 'image/png']);

  // admin profiles are users: /settings/admins goes to the Auth Service, even though it starts with /settings
  const admin = await call(gw, 'POST', '/api/v1/settings/admins', { token, json: { firstName: 'Sam', lastName: 'Lee', phone: '0712223333', email: 'sam@poscafe.com', password: 'Abc@1234' } });
  assert.equal(admin.status, 201, JSON.stringify(admin.body));
  const pic = await call(gw, 'POST', `/api/v1/settings/admins/${admin.body.data.id}/image`, { token, form: png() });
  assert.equal(pic.status, 200);
  assert.match(pic.body.data.image, /^\/uploads\/admins\//);
  created.add(path.basename(pic.body.data.image));
  assert.deepEqual([(await call(gw, 'GET', pic.body.data.image)).status, (await call(gw, 'GET', logo.body.data.image)).status], [200, 200]);
  assert.equal((await call(gw, 'GET', `/uploads/admins/${path.basename(logo.body.data.image)}`)).status, 404, 'a logo is not served from the admin folder');

  // logout in the Auth Service is felt by the Settings Service at once
  assert.equal((await call(gw, 'POST', '/api/v1/auth/logout', { token })).status, 200);
  const after = await call(gw, 'GET', '/api/v1/settings/shops', { token });
  assert.deepEqual([after.status, after.body.code], [401, 'UNAUTHENTICATED']);
});

test('a token the Settings Service cannot confirm is never trusted: Auth Service down gives 503, a forged token gives 401', async () => {
  const { auth, gw } = await startAll();
  const token = await signUp(gw, auth, 'down@poscafe.com');
  assert.equal((await call(gw, 'GET', '/api/v1/settings/shops', { token })).status, 200);
  assert.equal((await call(gw, 'GET', '/api/v1/settings/shops', { token: `${token.slice(0, -3)}abc` })).status, 401, 'bad signature is decided locally');

  await stop(auth.server); // the Auth Service goes away
  const res = await call(gw, 'GET', '/api/v1/settings/shops', { token });
  assert.deepEqual([res.status, res.body.code], [503, 'SERVICE_UNAVAILABLE'], 'fails closed instead of trusting the token');
  assert.equal((await call(gw, 'GET', '/api/v1/auth/me', { token })).status, 503, 'the gateway reports the unreachable service');
});

test('a missing Settings Service is a clean 503 on /auth/me and on signup activation, and the Gateway reports it', async () => {
  const { auth, settings, gw } = await startAll();
  const token = await signUp(gw, auth, 'nosettings@poscafe.com');
  await stop(settings.server);
  const me = await call(gw, 'GET', '/api/v1/auth/me', { token });
  assert.deepEqual([me.status, me.body.code], [503, 'SERVICE_UNAVAILABLE']);
  assert.equal((await call(gw, 'GET', '/api/v1/settings/shops', { token })).status, 503);
  const health = await call(gw, 'GET', '/health/services');
  assert.deepEqual([health.status, health.body.data.services], [503, { 'auth-service': 'ok', 'settings-service': 'unreachable', 'menu-service': 'ok', 'staff-service': 'ok', 'sales-service': 'ok' }]);
});

test('the internal endpoints of both services are not reachable through the Gateway', async () => {
  const { gw } = await startAll();
  for (const url of ['/internal/sessions/verify', '/internal/accounts/1/shops']) {
    assert.equal((await call(gw, url.includes('verify') ? 'POST' : 'GET', url, { json: url.includes('verify') ? {} : undefined })).status, 404, url);
  }
});

test('Menu Service through the Gateway: signed-in users manage the menu, photos are public, applications go to Sales', async () => {
  const { auth, gw } = await startAll();
  const token = await signUp(gw, auth, 'menu@poscafe.com');
  for (const url of ['/api/v1/products', '/api/v1/categories', '/api/v1/ingredients', '/api/v1/discounts']) {
    assert.equal((await call(gw, 'GET', url)).status, 401, `${url} needs a token`);
    assert.equal((await call(gw, 'GET', url, { token })).status, 200, url);
  }
  const cat = (await call(gw, 'POST', '/api/v1/categories', { token, json: { name: 'Coffee' } })).body.data;
  const discount = (await call(gw, 'POST', '/api/v1/discounts', { token, json: { name: 'Seasonal', percentage: 10 } })).body.data;
  const product = await call(gw, 'POST', '/api/v1/products', { token, json: { name: 'Ice Coffee', categoryId: cat.id, sellingPrice: 500, quantity: 20, lowStockAlert: 5, discountId: discount.id, ingredients: [{ name: 'Milk', quantity: '50 ml' }] } });
  assert.equal(product.status, 201, JSON.stringify(product.body));
  assert.deepEqual([product.body.data.category, product.body.data.discountPercentage, product.body.data.ingredients[0].name], ['Coffee', 10, 'Milk']);
  const photo = await call(gw, 'POST', `/api/v1/products/${product.body.data.id}/image`, { token, form: png() });
  assert.equal(photo.status, 200, JSON.stringify(photo.body));
  created.add(path.basename(photo.body.data.image));
  const served = await call(gw, 'GET', photo.body.data.image);
  assert.deepEqual([served.status, served.headers.get('content-type')], [200, 'image/png']);
  assert.equal((await call(gw, 'GET', '/api/v1/ingredients?search=mi', { token })).body.data[0].name, 'Milk');

  assert.equal((await call(gw, 'POST', '/api/v1/auth/logout', { token })).status, 200);
  assert.equal((await call(gw, 'GET', '/api/v1/products', { token })).status, 401, 'logout is felt by the Menu Service');
  const fresh = (await call(gw, 'POST', '/api/v1/auth/login', { json: { email: 'menu@poscafe.com', password: 'Abc@1234' } })).body.data.token;
  assert.equal((await call(gw, 'GET', '/api/v1/discounts/applications', { token: fresh })).status, 200, 'discount applications belong to the Sales Service');
  assert.deepEqual((await call(gw, 'GET', '/api/v1/discounts', { token: fresh })).body.data.map((d) => d.name), ['Seasonal'], 'discount definitions stay with the Menu Service');
});

test('Sales Service through the Gateway: orders are priced from the Menu, discounts apply, reports and the Dashboard read them', async () => {
  const { auth, gw } = await startAll();
  const token = await signUp(gw, auth, 'sales@poscafe.com');
  const shopId = (await call(gw, 'GET', '/api/v1/settings/shops', { token })).body.data[0].id;
  for (const url of ['/api/v1/orders', '/api/v1/orders/export', '/api/v1/reports/sales/summary', '/api/v1/dashboard/summary', '/api/v1/discounts/applications']) {
    assert.equal((await call(gw, 'GET', url)).status, 401, `${url} needs a token`);
    assert.equal((await call(gw, 'GET', url, { token })).status, 200, url);
  }
  const cat = (await call(gw, 'POST', '/api/v1/categories', { token, json: { name: 'Sales Coffee' } })).body.data; // unique names: the Menu Service keeps the data of the tests above
  const discount = (await call(gw, 'POST', '/api/v1/discounts', { token, json: { name: 'Sales Ten', percentage: 10 } })).body.data;
  const latte = (await call(gw, 'POST', '/api/v1/products', { token, json: { name: 'Latte', categoryId: cat.id, sellingPrice: 250.5, quantity: 0, lowStockAlert: 5 } })).body.data;
  const muffin = (await call(gw, 'POST', '/api/v1/products', { token, json: { name: 'Muffin', categoryId: cat.id, sellingPrice: 180, quantity: 40, lowStockAlert: 5 } })).body.data;

  const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const app = await call(gw, 'POST', '/api/v1/discounts/applications', { token, json: { discountId: discount.id, startDate: day(-1), endDate: day(1), appliesToAll: false, productIds: [latte.id] } });
  assert.equal(app.status, 201, JSON.stringify(app.body));
  assert.equal((await call(gw, 'POST', '/api/v1/discounts/applications', { token, json: { discountId: 999, startDate: day(0), endDate: day(0), appliesToAll: true } })).status, 400, 'Sales asked the Menu Service and it does not know that discount');

  const order = await call(gw, 'POST', '/api/v1/orders', { token, json: { type: 'Dine-In', tableLabel: 'T2', items: [{ productId: latte.id, quantity: 2 }, { productId: muffin.id, quantity: 1 }] } });
  assert.equal(order.status, 201, JSON.stringify(order.body));
  assert.deepEqual([order.body.data.shopId, order.body.data.subtotal, order.body.data.discountTotal, order.body.data.total, order.body.data.status], [shopId, 681, 50.1, 630.9, 'Pending']);
  assert.equal((await call(gw, 'PUT', `/api/v1/orders/${order.body.data.id}`, { token, json: { type: 'Take Away', items: [{ productId: muffin.id, quantity: 3 }] } })).body.data.total, 540);
  assert.equal((await call(gw, 'GET', `/api/v1/orders/${order.body.data.id}`, { token })).body.data.type, 'Take Away');
  const oid = order.body.data.id;
  assert.equal((await call(gw, 'POST', `/api/v1/orders/${oid}/payments`, { token, json: { method: 'Cash' } })).status, 409, 'not payable before delivery');
  assert.equal((await call(gw, 'PATCH', `/api/v1/orders/${oid}/status`, { token, json: { status: 'Preparing' } })).body.data.status, 'Preparing');
  assert.equal((await call(gw, 'PATCH', `/api/v1/orders/${oid}/status`, { token, json: { status: 'Delivered' } })).body.data.status, 'Delivered');
  const paid = await call(gw, 'POST', `/api/v1/orders/${oid}/payments`, { token, json: { method: 'Card' } });
  assert.deepEqual([paid.status, paid.body.data.status, paid.body.data.payment.method, paid.body.data.payment.amount], [201, 'Paid', 'Card', 540]);
  assert.equal((await call(gw, 'PATCH', `/api/v1/orders/${oid}/status`, { token, json: { status: 'Cancelled' } })).status, 400, 'cancelling is not available');

  const list = await call(gw, 'GET', '/api/v1/orders', { token });
  assert.deepEqual([list.body.meta.total, list.body.data[0].itemsText], [1, '3x Muffin']);
  const csv = await fetch(`${gw}/api/v1/orders/export`, { headers: { authorization: `Bearer ${token}` } });
  assert.deepEqual([csv.status, (await csv.text()).split('\r\n').length], [200, 3]);
  assert.equal((await call(gw, 'GET', '/api/v1/reports/sales/summary', { token })).body.data.totalRevenue, 540);
  const top = (await call(gw, 'GET', '/api/v1/dashboard/top-selling', { token })).body.data.items;
  assert.deepEqual([top[0].name, top[0].sold, top[0].category], ['Muffin', 3, 'Sales Coffee']);
  const stock = (await call(gw, 'GET', '/api/v1/dashboard/stock', { token })).body.data;
  assert.equal(stock.source, 'menu_products');
  assert.ok(stock.counts.outOfStock >= 1 && stock.items.some((i) => i.name === 'Latte' && i.status === 'Out of stock'), 'the out-of-stock Latte is reported');

  assert.equal((await call(gw, 'POST', '/internal/products/lookup', { json: { ids: [1] } })).status, 404, 'the Menu internal API is not routed');
  assert.equal((await call(gw, 'GET', '/internal/stock-overview')).status, 404, 'the Menu internal API is not routed');
  assert.equal((await call(gw, 'POST', '/api/v1/auth/logout', { token })).status, 200);
  assert.equal((await call(gw, 'GET', '/api/v1/orders', { token })).status, 401, 'logout is felt by the Sales Service');
});

test('a missing Menu Service makes order creation a clean 503 and nothing is saved', async () => {
  const { auth, menu, gw } = await startAll();
  const token = await signUp(gw, auth, 'salesdown@poscafe.com');
  await stop(menu.server);
  const res = await call(gw, 'POST', '/api/v1/orders', { token, json: { type: 'Take Away', items: [{ productId: 1, quantity: 1 }] } });
  assert.deepEqual([res.status, res.body.code], [503, 'SERVICE_UNAVAILABLE']);
  assert.deepEqual((await call(gw, 'GET', '/api/v1/orders', { token })).body.data, []);
});

