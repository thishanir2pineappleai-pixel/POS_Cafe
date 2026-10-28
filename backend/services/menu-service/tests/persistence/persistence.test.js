// Restart persistence: the Menu Service runs as a REAL process on MySQL (Prisma), the menu is built through the HTTP API,
// the process is stopped and started again, and everything must still be there. Needs MENU_TEST_DATABASE_URL (a database
// whose name ends in _test, already migrated: pnpm --filter @pos-cafe/menu-service db:migrate:deploy). Without it the tests
// are SKIPPED and say so.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { testDatabase } = require('@pos-cafe/shared/testing/database');
const { startServiceProcess, freePort } = require('@pos-cafe/shared/testing/serviceProcess');

const db = testDatabase('MENU_TEST_DATABASE_URL');
const SERVICE_DIR = path.resolve(__dirname, '../..');
const skip = db ? false : 'MENU_TEST_DATABASE_URL is not set: persistence was NOT tested';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

let port; let service; let prisma; let uploads;
const start = () => startServiceProcess({
  serviceDir: SERVICE_DIR,
  port,
  env: {
    REPOSITORY_DRIVER: 'prisma', MENU_DATABASE_URL: db.url, MENU_SERVICE_PORT: String(port), HOST: '127.0.0.1', MENU_REQUIRE_AUTH: 'false', UPLOADS_DIR: uploads,
    JWT_SECRET: crypto.randomBytes(24).toString('hex'), INTERNAL_SERVICE_KEY: crypto.randomBytes(24).toString('hex'),
  },
});
const call = async (method, url, { json, form } = {}) => {
  const res = await fetch(service.url + url, { method, headers: json ? { 'content-type': 'application/json' } : {}, body: json ? JSON.stringify(json) : form });
  const bytes = Buffer.from(await res.arrayBuffer());
  let body; try { body = JSON.parse(bytes.toString()); } catch { body = null; }
  return { status: res.status, body, bytes, headers: res.headers };
};
const wipe = async () => {
  await prisma.productIngredient.deleteMany();
  await prisma.product.deleteMany();
  await prisma.ingredient.deleteMany();
  await prisma.discount.deleteMany();
  await prisma.category.deleteMany();
};

before(async () => {
  if (!db) return;
  port = await freePort();
  uploads = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-menu-persist-'));
  process.env.REPOSITORY_DRIVER = 'prisma';
  process.env.MENU_DATABASE_URL = db.url;
  ({ prisma } = require('../../repositories/prisma/client'));
  await wipe();
  service = await start();
});
after(async () => {
  if (!db) return;
  await service?.stop();
  await wipe();
  await prisma.$disconnect();
  fs.rmSync(uploads, { recursive: true, force: true });
});

test('the whole menu is still there after the service is stopped and started again', { skip }, async () => {
  const cat = (await call('POST', '/api/v1/categories', { json: { name: 'Coffee ☕' } })).body.data;
  const disc = (await call('POST', '/api/v1/discounts', { json: { name: 'Seasonal Discount', percentage: 7.5 } })).body.data;
  const made = await call('POST', '/api/v1/products', { json: {
    name: 'Ice Coffee', categoryId: cat.id, costPrice: 350, sellingPrice: 500.5, quantity: 12, lowStockAlert: 15, discountId: disc.id,
    ingredients: [{ name: 'Sugar', quantity: '5 g' }, { name: 'Milk', quantity: '50 ml' }],
  } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = made.body.data.id;
  assert.equal((await call('PATCH', `/api/v1/products/${id}/ingredients/${made.body.data.ingredients[1].id}`, { json: { quantity: '55 ml' } })).status, 200);
  const form = new FormData();
  form.append('image', new Blob([PNG]), 'x.png');
  const photo = await call('POST', `/api/v1/products/${id}/image`, { form });
  assert.equal(photo.status, 200, JSON.stringify(photo.body));

  const before = {
    product: (await call('GET', `/api/v1/products/${id}`)).body.data,
    list: (await call('GET', '/api/v1/products')).body,
    categories: (await call('GET', '/api/v1/categories')).body.data,
    discounts: (await call('GET', '/api/v1/discounts')).body.data,
    ingredients: (await call('GET', '/api/v1/ingredients')).body.data,
    summary: (await call('GET', '/api/v1/products/summary')).body.data,
  };
  assert.equal(before.product.status, 'Low Stock');
  assert.deepEqual(before.product.ingredients.map((i) => [i.name, i.quantity]), [['Sugar', '5 g'], ['Milk', '55 ml']]);

  await service.stop();
  await assert.rejects(fetch(`${service.url}/health`, { signal: AbortSignal.timeout(1000) }), 'the service is down');
  service = await start(); // a brand new process: nothing is in its memory

  assert.deepEqual((await call('GET', `/api/v1/products/${id}`)).body.data, before.product, 'the product, its joins and ingredients are identical');
  assert.deepEqual((await call('GET', '/api/v1/products')).body, before.list);
  assert.deepEqual((await call('GET', '/api/v1/categories')).body.data, before.categories);
  assert.deepEqual((await call('GET', '/api/v1/discounts')).body.data, before.discounts);
  assert.deepEqual((await call('GET', '/api/v1/ingredients')).body.data, before.ingredients);
  assert.deepEqual((await call('GET', '/api/v1/products/summary')).body.data, before.summary);
  const served = await call('GET', before.product.image);
  assert.deepEqual([served.status, served.bytes.equals(PNG)], [200, true], 'the photo file and the reference to it both survived');

  // the data keeps behaving like data after the restart: ids continue, rules still apply
  assert.equal((await call('POST', '/api/v1/categories', { json: { name: 'coffee ☕' } })).status, 409, 'duplicate names are refused ignoring case');
  const next = await call('POST', '/api/v1/categories', { json: { name: 'Tea' } });
  assert.ok(next.body.data.id > cat.id, 'ids continue instead of restarting');
  assert.equal((await call('DELETE', `/api/v1/products/${id}`)).status, 200);
  await service.stop();
  service = await start();
  assert.equal((await call('GET', `/api/v1/products/${id}`)).status, 404, 'a delete is permanent across a restart');
  assert.deepEqual((await call('GET', '/api/v1/ingredients')).body.data.map((i) => i.name), ['Sugar', 'Milk'], 'deleting a product keeps its ingredients');
});

test('service output never contains the database password', { skip }, () => {
  assert.match(service.output(), /Menu Service listening/);
  assert.ok(!service.output().includes(db.connection.password));
});
