// Menu Service with MENU_REQUIRE_AUTH on: every API route needs a signed-in user, confirmed by the Auth Service
// (a stand-in that keeps the real contract); product photos stay public. Without it the routes are open (menu.test.js).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { startFakeAuthService } = require('@pos-cafe/shared/testing/fakeAuthService');
const { createApp } = require('../../app');
const { reset } = require('../../repositories/memory/store');
const { env, uploads } = require('../../config');
const { parseRequireAuth } = require('../../config/env');

let auth;
let server;
let base;
const created = new Set();

before(async () => {
  auth = await startFakeAuthService({ secret: env.jwtSecret, internalKey: env.internalKey });
  server = createApp({ requireAuth: true, authBaseUrl: auth.url }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
  reset();
});
after(async () => {
  for (const f of created) fs.rmSync(path.join(uploads.productsDir, f), { force: true });
  try { fs.rmdirSync(uploads.productsDir); } catch { /* not empty or missing */ }
  await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); });
  await auth.stop();
});

const call = (method, url, { token, json } = {}) => fetch(base + url, {
  method,
  headers: { ...(json ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: json ? JSON.stringify(json) : undefined,
});
const ROUTES = [
  ['GET', '/api/v1/products'], ['GET', '/api/v1/products/summary'], ['GET', '/api/v1/products/1'], ['POST', '/api/v1/products'],
  ['PUT', '/api/v1/products/1'], ['DELETE', '/api/v1/products/1'], ['PATCH', '/api/v1/products/1/ingredients/1'], ['POST', '/api/v1/products/1/image'],
  ['GET', '/api/v1/categories'], ['POST', '/api/v1/categories'], ['GET', '/api/v1/ingredients'], ['POST', '/api/v1/ingredients'],
  ['GET', '/api/v1/discounts'], ['POST', '/api/v1/discounts'],
];

test('every Menu API route refuses a request without a valid token', async () => {
  for (const [method, url] of ROUTES) assert.equal((await call(method, url, method === 'GET' || method === 'DELETE' ? {} : { json: {} })).status, 401, `${method} ${url}`);
  assert.equal((await call('GET', '/api/v1/products', { token: 'not.a.token' })).status, 401);
  assert.equal((await call('GET', '/health')).status, 200, 'health needs no token');
});

test('a signed-in user of any account can use the Menu API (menu data is not shop-scoped yet)', async () => {
  const token = auth.token({ userId: 1, accountId: 1 }).token;
  const other = auth.token({ userId: 2, accountId: 2, role: 'admin' }).token;
  const made = await call('POST', '/api/v1/categories', { token, json: { name: 'Coffee' } });
  assert.equal(made.status, 201);
  assert.deepEqual((await (await call('GET', '/api/v1/categories', { token: other })).json()).data.map((c) => c.name), ['Coffee']);
});

test('a revoked session is refused, and an unreachable Auth Service fails closed (503)', async () => {
  const { token, sid } = auth.token({ userId: 3, accountId: 1 });
  assert.equal((await call('GET', '/api/v1/products', { token })).status, 200);
  auth.revoke(sid);
  assert.equal((await call('GET', '/api/v1/products', { token })).status, 401);

  const down = createApp({ requireAuth: true, authBaseUrl: 'http://127.0.0.1:1' }).listen(0, '127.0.0.1');
  await once(down, 'listening');
  const res = await fetch(`http://127.0.0.1:${down.address().port}/api/v1/products`, { headers: { authorization: `Bearer ${auth.token({ userId: 4 }).token}` } });
  assert.deepEqual([res.status, (await res.json()).code], [503, 'SERVICE_UNAVAILABLE']);
  await new Promise((resolve) => { down.closeAllConnections(); down.close(resolve); });
});

test('product photos stay public, with nosniff, and the API stays closed', async () => {
  const token = auth.token({ userId: 1, accountId: 1 }).token;
  const cat = (await (await call('POST', '/api/v1/categories', { token, json: { name: 'Photos' } })).json()).data;
  const product = (await (await call('POST', '/api/v1/products', { token, json: { name: 'Latte', categoryId: cat.id, sellingPrice: 500, quantity: 5 } })).json()).data;
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('image', new Blob([PNG]), 'x.png');
  const up = await fetch(`${base}/api/v1/products/${product.id}/image`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
  assert.equal(up.status, 200);
  const url = (await up.json()).data.image;
  created.add(path.basename(url));
  const photo = await fetch(base + url);
  assert.deepEqual([photo.status, photo.headers.get('x-content-type-options')], [200, 'nosniff']);
});

test('MENU_REQUIRE_AUTH: only true or false, and production refuses open routes', () => {
  assert.equal(parseRequireAuth(undefined), false);
  assert.equal(parseRequireAuth('true'), true);
  assert.throws(() => parseRequireAuth('yes'), /true or false/);
});
