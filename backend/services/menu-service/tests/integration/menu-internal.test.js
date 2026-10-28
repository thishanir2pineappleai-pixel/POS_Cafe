// The Menu Service's internal API (service to service, X-Internal-Key): the read-only view the Sales Service uses.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp } = require('../../app');
const { reset } = require('../../repositories/memory/store');
const { env } = require('../../config');

let server;
let base;
before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }); });
beforeEach(() => reset());

async function call(method, url, { json, key = env.internalKey } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(json ? { 'content-type': 'application/json' } : {}), ...(key ? { 'x-internal-key': key } : {}) },
    body: json ? JSON.stringify(json) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const open = (method, url, json) => fetch(base + url, { method, headers: { 'content-type': 'application/json' }, body: json ? JSON.stringify(json) : undefined });

async function openCall(method, url, json) {
  const res = await open(method, url, json);
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('every internal route refuses a missing or wrong key', async () => {
  for (const [method, url, json] of [['POST', '/internal/products/lookup', { ids: [1] }], ['POST', '/internal/discounts/lookup', { ids: [1] }], ['GET', '/internal/stock-overview']]) {
    assert.equal((await call(method, url, { json, key: null })).status, 401, `${method} ${url} without key`);
    assert.equal((await call(method, url, { json, key: 'x'.repeat(40) })).status, 401, `${method} ${url} wrong key`);
  }
});

test('products/lookup returns existing products only, with the unit price; bad bodies answer 400', async () => {
  const category = (await openCall('POST', '/api/v1/categories', { name: 'Coffee' })).body.data;
  const product = (await openCall('POST', '/api/v1/products', { name: 'Latte', categoryId: category.id, costPrice: 100, sellingPrice: 250.5, quantity: 5, lowStockAlert: 2 })).body.data;
  const ok = await call('POST', '/internal/products/lookup', { json: { ids: [product.id, product.id, 9999] } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.data, [{ id: product.id, name: 'Latte', categoryName: 'Coffee', sellingPrice: 250.5, image: null }]);
  for (const ids of [undefined, [], ['1'], [0], [1.5], Array.from({ length: 101 }, (_, i) => i + 1)]) {
    assert.equal((await call('POST', '/internal/products/lookup', { json: { ids } })).status, 400, JSON.stringify(ids)?.slice(0, 30));
  }
  assert.equal((await call('POST', '/internal/products/lookup', { json: [1] })).status, 400);
});

test('discounts/lookup returns the definitions that exist', async () => {
  const d = (await openCall('POST', '/api/v1/discounts', { name: 'Ten', percentage: 10 })).body.data;
  assert.deepEqual((await call('POST', '/internal/discounts/lookup', { json: { ids: [d.id, 9999] } })).body.data, [{ id: d.id, name: 'Ten', percentage: 10 }]);
  assert.deepEqual((await call('POST', '/internal/discounts/lookup', { json: { ids: [9999] } })).body.data, []);
  assert.equal((await call('POST', '/internal/discounts/lookup', { json: { ids: ['x'] } })).status, 400);
});

test('stock-overview counts products and lists the ones needing attention', async () => {
  assert.deepEqual((await call('GET', '/internal/stock-overview')).body.data, { source: 'menu_products', counts: { outOfStock: 0, lowStock: 0, inStock: 0 }, items: [] });
  const category = (await openCall('POST', '/api/v1/categories', { name: 'Coffee' })).body.data;
  await openCall('POST', '/api/v1/products', { name: 'Out', categoryId: category.id, sellingPrice: 100, quantity: 0, lowStockAlert: 5 });
  await openCall('POST', '/api/v1/products', { name: 'Low', categoryId: category.id, sellingPrice: 100, quantity: 2, lowStockAlert: 5 });
  await openCall('POST', '/api/v1/products', { name: 'Fine', categoryId: category.id, sellingPrice: 100, quantity: 50, lowStockAlert: 5 });
  const res = await call('GET', '/internal/stock-overview?limit=5');
  assert.deepEqual(res.body.data.counts, { outOfStock: 1, lowStock: 1, inStock: 1 });
  assert.deepEqual(res.body.data.items.map((i) => [i.name, i.status, i.code.startsWith('#PRD')]), [['Out', 'Out of stock', true], ['Low', 'Low Stock', true]]);
  assert.equal((await call('GET', '/internal/stock-overview?limit=0')).status, 400);
  assert.equal((await call('GET', '/internal/stock-overview?limit=21')).status, 400);
});
