// Integration tests for the Menu Management API. They start the real Express app on a random local port and use
// the temporary in-memory repositories: no MySQL, no network beyond 127.0.0.1. Run with: pnpm --filter @pos-cafe/menu-service test
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { createApp } = require('../../app');
const { reset } = require('../../repositories/memory/store');
const { uploads } = require('../../config');
const { parseHost } = require('@pos-cafe/shared/env');

const V1 = '/api/v1';
let server;
let base;
const uploadedFiles = new Set();

before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  for (const f of uploadedFiles) fs.rmSync(path.join(uploads.productsDir, f), { force: true });
  await new Promise((resolve) => server.close(resolve));
});
beforeEach(() => reset());

async function api(method, url, { json, form, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (json !== undefined) { init.body = JSON.stringify(json); init.headers['content-type'] = 'application/json'; }
  if (form) init.body = form;
  const res = await fetch(base + url, init);
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

const makeCategory = async (name = 'Coffee') => (await api('POST', `${V1}/categories`, { json: { name } })).body.data;
const productBody = (categoryId, over = {}) => ({ name: 'Ice Coffee', categoryId, costPrice: 350, sellingPrice: 500, quantity: 112, lowStockAlert: 15, ...over });
async function makeProduct(categoryId, over) {
  const res = await api('POST', `${V1}/products`, { json: productBody(categoryId, over) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}
const fieldsOf = (res) => (res.body.errors || []).map((e) => e.field);

// Smallest valid PNG (1x1), plus a synthetic JPEG (FF D8 FF ... FF D9).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0'), Buffer.alloc(24, 7), Buffer.from([0xff, 0xd9])]);
const imageForm = (buffer, filename = 'photo.png', field = 'image') => {
  const form = new FormData();
  form.append(field, new Blob([buffer]), filename);
  return form;
};
const productFiles = () => (fs.existsSync(uploads.productsDir) ? fs.readdirSync(uploads.productsDir).filter((f) => /\.(png|jpg)$/.test(f)) : []);

// ---------- general ----------
test('unknown routes and malformed JSON return JSON errors', async () => {
  const missing = await api('GET', `${V1}/nope`);
  assert.equal(missing.status, 404);
  assert.deepEqual([missing.body.success, missing.body.code], [false, 'NOT_FOUND']);
  const bad = await fetch(`${base}${V1}/categories`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).code, 'VALIDATION_ERROR');
  assert.equal(missing.headers.get('x-powered-by'), null);
});

test('collections start empty (no seed data)', async () => {
  for (const url of ['categories', 'ingredients', 'discounts', 'products']) {
    const res = await api('GET', `${V1}/${url}`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, []);
  }
});

test('CORS is handled by the Gateway: the service itself adds no CORS headers', async () => {
  const res = await api('GET', `${V1}/categories`, { headers: { origin: 'http://localhost:5173' } });
  assert.equal(res.headers.get('access-control-allow-origin'), null);
});

test('the server only accepts a loopback HOST', () => {
  assert.equal(parseHost('127.0.0.1'), '127.0.0.1');
  assert.equal(parseHost(undefined), '127.0.0.1');
  assert.throws(() => parseHost('0.0.0.0'), /loopback/);
  assert.throws(() => parseHost('192.168.1.20'), /loopback/);
});

// ---------- categories, discounts, ingredients ----------
test('categories: create, list, duplicates (ignoring case) and validation', async () => {
  const created = await api('POST', `${V1}/categories`, { json: { name: '  Coffee ' } });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.data, { id: 1, name: 'Coffee' });
  assert.equal((await api('POST', `${V1}/categories`, { json: { name: 'coffee' } })).status, 409);
  await api('POST', `${V1}/categories`, { json: { name: 'Drinks' } });
  assert.deepEqual((await api('GET', `${V1}/categories`)).body.data.map((c) => c.name), ['Coffee', 'Drinks']);
  for (const json of [{}, { name: '' }, { name: '   ' }, { name: 5 }, { name: 'x'.repeat(101) }, [], 'text']) {
    assert.equal((await api('POST', `${V1}/categories`, { json })).status, 400, JSON.stringify(json));
  }
});

test('discounts: definitions with name and percentage 0-100', async () => {
  const ok = await api('POST', `${V1}/discounts`, { json: { name: 'Seasonal Discount', percentage: 10 } });
  assert.equal(ok.status, 201);
  assert.deepEqual(ok.body.data, { id: 1, name: 'Seasonal Discount', percentage: 10 });
  assert.equal((await api('POST', `${V1}/discounts`, { json: { name: 'Zero', percentage: 0 } })).status, 201);
  assert.equal((await api('POST', `${V1}/discounts`, { json: { name: 'Half', percentage: '7.5' } })).body.data.percentage, 7.5);
  assert.equal((await api('POST', `${V1}/discounts`, { json: { name: 'seasonal discount', percentage: 5 } })).status, 409);
  for (const percentage of [-1, 101, 'abc', 12.345, null, undefined]) {
    const res = await api('POST', `${V1}/discounts`, { json: { name: `D${String(percentage)}`, percentage } });
    assert.equal(res.status, 400, String(percentage));
    assert.deepEqual(fieldsOf(res), ['percentage']);
  }
  assert.equal((await api('POST', `${V1}/discounts`, { json: { percentage: 5 } })).status, 400);
  assert.equal((await api('GET', `${V1}/discounts`)).body.data.length, 3);
});

test('ingredients: create, autocomplete search, duplicates', async () => {
  const created = await api('POST', `${V1}/ingredients`, { json: { name: 'Brown Sugar' } });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.data, { id: 1, code: '#ING1', name: 'Brown Sugar' });
  await api('POST', `${V1}/ingredients`, { json: { name: 'Sugar Syrup' } });
  await api('POST', `${V1}/ingredients`, { json: { name: 'Milk' } });
  assert.equal((await api('POST', `${V1}/ingredients`, { json: { name: 'MILK' } })).status, 409);
  assert.deepEqual((await api('GET', `${V1}/ingredients?search=sug`)).body.data.map((i) => i.name), ['Brown Sugar', 'Sugar Syrup']);
  assert.equal((await api('GET', `${V1}/ingredients?search=zzz`)).body.data.length, 0);
  assert.equal((await api('GET', `${V1}/ingredients`)).body.data.length, 3);
  assert.equal((await api('GET', `${V1}/ingredients?search=${'a'.repeat(101)}`)).status, 400);
  assert.equal((await api('POST', `${V1}/ingredients`, { json: { name: '' } })).status, 400);
});

// ---------- products: validation ----------
test('products: required fields are reported and optional ones are not', async () => {
  const empty = await api('POST', `${V1}/products`, { json: {} });
  assert.equal(empty.status, 400);
  assert.deepEqual(fieldsOf(empty).sort(), ['categoryId', 'name', 'quantity', 'sellingPrice']);
  const { id } = await makeCategory();
  const minimal = await api('POST', `${V1}/products`, { json: { name: 'Espresso', categoryId: id, sellingPrice: 350, quantity: 5 } });
  assert.equal(minimal.status, 201);
  assert.equal(minimal.body.data.costPrice, null); // optional
  assert.equal(minimal.body.data.discountId, null); // optional
  assert.equal(minimal.body.data.lowStockAlert, null); // no default is invented
  assert.equal(minimal.body.data.status, 'In Stock');
  assert.deepEqual(minimal.body.data.ingredients, []);
});

test('products: bad values are rejected with field errors', async () => {
  const { id } = await makeCategory();
  const cases = {
    name: [{ name: '' }, { name: 5 }, { name: 'x'.repeat(151) }],
    sellingPrice: [{ sellingPrice: -1 }, { sellingPrice: 10.123 }, { sellingPrice: 'abc' }, { sellingPrice: 1e9 }],
    costPrice: [{ costPrice: -5 }, { costPrice: '1.234' }],
    quantity: [{ quantity: -1 }, { quantity: 1.5 }, { quantity: 'many' }],
    lowStockAlert: [{ lowStockAlert: -2 }, { lowStockAlert: 2.5 }],
    categoryId: [{ categoryId: 0 }, { categoryId: 'x' }],
    ingredients: [{ ingredients: 'sugar' }, { ingredients: [{ name: 'Sugar' }] }, { ingredients: [{ name: 'Sugar', quantity: '1 g' }, { name: 'sugar', quantity: '2 g' }] }],
  };
  for (const [field, variants] of Object.entries(cases)) {
    for (const over of variants) {
      const res = await api('POST', `${V1}/products`, { json: productBody(id, over) });
      assert.equal(res.status, 400, JSON.stringify(over));
      assert.ok(fieldsOf(res).some((f) => f.startsWith(field)), `${JSON.stringify(over)} -> ${fieldsOf(res)}`);
    }
  }
  assert.equal((await api('POST', `${V1}/products`, { json: productBody(999) })).status, 400); // unknown category
  assert.equal((await api('POST', `${V1}/products`, { json: productBody(id, { discountId: 999 }) })).status, 400); // unknown discount
  assert.equal((await api('POST', `${V1}/products`, { json: [] })).status, 400);
  assert.equal((await api('GET', `${V1}/products`)).body.data.length, 0); // nothing was created
});

test('products: id parameters and unknown ids', async () => {
  for (const id of ['abc', '0', '-1', '1.5']) assert.equal((await api('GET', `${V1}/products/${id}`)).status, 400, id);
  assert.equal((await api('GET', `${V1}/products/99`)).status, 404);
  assert.equal((await api('PUT', `${V1}/products/99`, { json: productBody(1) })).status, 404);
  assert.equal((await api('DELETE', `${V1}/products/99`)).status, 404);
  assert.equal((await api('PATCH', `${V1}/products/99/ingredients/1`, { json: { quantity: '1 g' } })).status, 404);
});

// ---------- products: CRUD, ingredients, discount ----------
test('products: create with ingredients and discount, read, update, delete', async () => {
  const coffee = await makeCategory('Coffee');
  const drinks = await makeCategory('Drinks');
  const discount = (await api('POST', `${V1}/discounts`, { json: { name: 'Seasonal Discount', percentage: 10 } })).body.data;
  const created = await makeProduct(coffee.id, {
    discountId: discount.id,
    ingredients: [{ name: 'Sugar', quantity: '40 g' }, { name: 'Espresso', quantity: '60 ml' }],
  });
  assert.equal(created.code, '#PRD1');
  assert.equal(created.category, 'Coffee');
  assert.equal(created.discountType, 'Seasonal Discount');
  assert.equal(created.discountPercentage, 10);
  assert.deepEqual(created.ingredients.map((i) => [i.code, i.name, i.quantity]), [['#ING1', 'Sugar', '40 g'], ['#ING2', 'Espresso', '60 ml']]);
  assert.equal((await api('GET', `${V1}/ingredients`)).body.data.length, 2); // ingredients were created once

  const read = await api('GET', `${V1}/products/${created.id}`);
  assert.deepEqual(read.body.data, created);

  const updated = await api('PUT', `${V1}/products/${created.id}`, {
    json: productBody(drinks.id, { name: 'Iced Coffee', sellingPrice: 600, quantity: 0, ingredients: [{ name: 'sugar', quantity: '50 g' }] }),
  });
  assert.equal(updated.status, 200);
  assert.deepEqual([updated.body.data.name, updated.body.data.category, updated.body.data.sellingPrice, updated.body.data.status], ['Iced Coffee', 'Drinks', 600, 'Out of stock']);
  assert.equal(updated.body.data.discountId, null); // PUT replaces the whole product
  assert.deepEqual(updated.body.data.ingredients.map((i) => [i.id, i.quantity]), [[1, '50 g']]); // existing ingredient reused
  assert.equal((await api('GET', `${V1}/ingredients`)).body.data.length, 2);

  const patched = await api('PATCH', `${V1}/products/${created.id}/ingredients/1`, { json: { quantity: '55 g' } });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.data.ingredients[0].quantity, '55 g');
  assert.equal((await api('PATCH', `${V1}/products/${created.id}/ingredients/2`, { json: { quantity: '1 g' } })).status, 404); // not linked
  assert.equal((await api('PATCH', `${V1}/products/${created.id}/ingredients/1`, { json: { quantity: '' } })).status, 400);
  assert.equal((await api('PATCH', `${V1}/products/${created.id}/ingredients/1`, { json: { quantity: 'x'.repeat(51) } })).status, 400);

  assert.equal((await api('DELETE', `${V1}/products/${created.id}`)).status, 200);
  assert.equal((await api('GET', `${V1}/products/${created.id}`)).status, 404);
  assert.equal((await api('DELETE', `${V1}/products/${created.id}`)).status, 404);
  // deleting a product leaves categories, discounts and ingredients alone
  assert.equal((await api('GET', `${V1}/categories`)).body.data.length, 2);
  assert.equal((await api('GET', `${V1}/discounts`)).body.data.length, 1);
  assert.equal((await api('GET', `${V1}/ingredients`)).body.data.length, 2);
});

test('products: stock status values', async () => {
  const { id } = await makeCategory();
  const status = async (quantity, lowStockAlert) => (await makeProduct(id, { quantity, lowStockAlert })).status;
  assert.equal(await status(0, 15), 'Out of stock');
  assert.equal(await status(0, null), 'Out of stock');
  assert.equal(await status(10, 15), 'Low Stock');
  assert.equal(await status(15, 15), 'In Stock'); // strictly below the alert (rule pending approval)
  assert.equal(await status(112, 15), 'In Stock');
  assert.equal(await status(3, null), 'In Stock'); // no alert set, no default invented
});

// ---------- products: list, search, filters, sorting, pagination, summary ----------
async function seedTwelve() {
  const coffee = await makeCategory('Coffee');
  const burgers = await makeCategory('Burgers');
  const names = ['Espresso', 'Cappuccino', 'Latte', 'Mocha', 'Americano', 'Cold Brew', 'Chicken Burger', 'Beef Burger', 'Cheese Burger', 'Veggie Burger', 'Fish Burger', 'BBQ Burger'];
  for (const [i, name] of names.entries()) {
    await makeProduct(i < 6 ? coffee.id : burgers.id, {
      name, sellingPrice: 100 + i * 10, quantity: [0, 10, 50][i % 3], lowStockAlert: 15,
    });
  }
  return { coffee, burgers };
}

test('products list: default order, pagination and meta', async () => {
  await seedTwelve();
  const first = await api('GET', `${V1}/products`);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.meta, { total: 12, page: 1, limit: 10, totalPages: 2 });
  assert.equal(first.body.data.length, 10);
  assert.equal(first.body.data[0].name, 'BBQ Burger'); // newest first (pending approval)
  assert.equal(first.body.data[0].ingredients, undefined); // list rows carry no ingredient lists
  const second = await api('GET', `${V1}/products?page=2`);
  assert.deepEqual(second.body.data.map((p) => p.name), ['Cappuccino', 'Espresso']);
  const small = await api('GET', `${V1}/products?limit=5&page=3`);
  assert.deepEqual([small.body.data.length, small.body.meta.totalPages], [2, 3]);
  assert.equal((await api('GET', `${V1}/products?page=9`)).body.data.length, 0);
  for (const q of ['page=0', 'page=x', 'limit=0', 'limit=101', 'limit=1.5']) assert.equal((await api('GET', `${V1}/products?${q}`)).status, 400, q);
});

test('products list: search, status and category filters, price sort', async () => {
  const { burgers } = await seedTwelve();
  const names = async (q) => (await api('GET', `${V1}/products?${q}&limit=100`)).body.data.map((p) => p.name);
  assert.deepEqual((await names('search=burger')).length, 6); // by name, case-insensitive
  assert.deepEqual(await names('search=ESPRESSO'), ['Espresso']);
  assert.deepEqual(await names('search=%23PRD3'), ['Latte']); // by code "#PRD3"
  assert.equal((await names('search=coffee')).length, 6); // by category name
  assert.equal((await names('search=low')).length, 4); // by status text ("Low Stock")
  assert.equal((await names('search=zzzz')).length, 0);

  assert.equal((await names('status=out_of_stock')).length, 4);
  assert.equal((await names('status=low_stock')).length, 4);
  assert.equal((await names('status=in_stock')).length, 4);
  assert.equal((await names(`categoryId=${burgers.id}`)).length, 6);
  assert.equal((await names(`categoryId=${burgers.id}&status=out_of_stock`)).length, 2);
  assert.equal((await names(`search=burger&status=in_stock&categoryId=${burgers.id}`)).length, 2);

  const asc = await api('GET', `${V1}/products?sort=price_asc&limit=100`);
  assert.deepEqual(asc.body.data.map((p) => p.sellingPrice), [...asc.body.data.map((p) => p.sellingPrice)].sort((a, b) => a - b));
  assert.equal(asc.body.data[0].name, 'Espresso');
  const desc = await api('GET', `${V1}/products?sort=price_desc&limit=3`);
  assert.deepEqual(desc.body.data.map((p) => p.name), ['BBQ Burger', 'Fish Burger', 'Veggie Burger']);
  for (const q of ['status=bogus', 'sort=name', 'categoryId=x', 'categoryId=0', `search=${'a'.repeat(101)}`]) {
    assert.equal((await api('GET', `${V1}/products?${q}`)).status, 400, q);
  }
});

test('products summary counts', async () => {
  assert.deepEqual((await api('GET', `${V1}/products/summary`)).body.data, { total: 0, active: 0, outOfStock: 0, categories: 0 });
  await seedTwelve();
  assert.deepEqual((await api('GET', `${V1}/products/summary`)).body.data, { total: 12, active: 8, outOfStock: 4, categories: 2 });
});

// ---------- product images ----------
test('image upload: JPEG and PNG are stored under generated names and served', async () => {
  const { id: categoryId } = await makeCategory();
  const product = await makeProduct(categoryId);

  const png = await api('POST', `${V1}/products/${product.id}/image`, { form: imageForm(PNG, '../../evil name.php') });
  assert.equal(png.status, 200, JSON.stringify(png.body));
  assert.match(png.body.data.image, /^\/uploads\/products\/[0-9a-f-]{36}\.png$/); // client filename ignored
  const pngName = path.basename(png.body.data.image);
  uploadedFiles.add(pngName);
  assert.ok(fs.existsSync(path.join(uploads.productsDir, pngName)));
  const served = await fetch(base + png.body.data.image);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');

  const jpg = await api('POST', `${V1}/products/${product.id}/image`, { form: imageForm(JPEG, 'photo.jpeg') }); // replaces the PNG
  assert.equal(jpg.status, 200);
  assert.match(jpg.body.data.image, /\.jpg$/);
  uploadedFiles.add(path.basename(jpg.body.data.image));
  assert.ok(!fs.existsSync(path.join(uploads.productsDir, pngName)), 'the replaced file is deleted');
  assert.equal((await api('GET', `${V1}/products/${product.id}`)).body.data.image, jpg.body.data.image);

  const before = productFiles().length;
  assert.equal((await api('DELETE', `${V1}/products/${product.id}`)).status, 200);
  assert.equal(productFiles().length, before - 1, 'deleting the product removes its image file');
});

test('image upload: limits and content checks', async () => {
  const { id: categoryId } = await makeCategory();
  const product = await makeProduct(categoryId);
  const url = `${V1}/products/${product.id}/image`;
  const filesBefore = productFiles().length;

  const tooBig = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(2 * 1024 * 1024 + 1, 1)]);
  const big = await api('POST', url, { form: imageForm(tooBig) });
  assert.equal(big.status, 413);
  assert.equal(big.body.code, 'IMAGE_TOO_LARGE');

  const fake = await api('POST', url, { form: imageForm(Buffer.from('<?php echo 1; ?>'), 'shell.png') });
  assert.equal(fake.status, 415); // a .png name does not make it a PNG
  assert.equal(fake.body.code, 'UNSUPPORTED_IMAGE');
  assert.equal((await api('POST', url, { form: imageForm(PNG.subarray(0, PNG.length - 6)) })).status, 415); // truncated PNG
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  assert.equal((await api('POST', url, { form: imageForm(gif, 'a.png') })).status, 415);

  assert.equal((await api('POST', url, { form: new FormData() })).status, 400); // no file
  assert.equal((await api('POST', url, { form: imageForm(PNG, 'a.png', 'photo') })).status, 400); // wrong field name
  const withText = imageForm(PNG);
  withText.append('note', 'extra field');
  assert.equal((await api('POST', url, { form: withText })).status, 400);
  assert.equal((await api('POST', url, { json: { image: 'x' } })).status, 400); // not multipart

  assert.equal((await api('POST', `${V1}/products/99/image`, { form: imageForm(PNG) })).status, 404);
  assert.equal((await api('POST', `${V1}/products/abc/image`, { form: imageForm(PNG) })).status, 400);
  assert.equal(productFiles().length, filesBefore, 'rejected uploads write nothing');
  assert.equal((await api('GET', `${V1}/products/${product.id}`)).body.data.image, null);
});

test('uploads cannot be used to read other files', async () => {
  const res = await fetch(`${base}/uploads/products/..%2f..%2fpackage.json`);
  assert.notEqual(res.status, 200);
  assert.equal((await fetch(`${base}/uploads/package.json`)).status, 404);
});
