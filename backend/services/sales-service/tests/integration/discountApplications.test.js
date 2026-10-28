// Sales discount applications over HTTP: the six routes migrated from the original backend. The discount definitions and
// the products are checked against the Menu Service (a stand-in here); the name and percentage are copied when saved.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { useTestServer } = require('./helpers');

const { ctx, api, signIn, tokenFor } = useTestServer();
const URL = '/api/v1/discounts/applications';

function menu() {
  ctx.menu.addDiscount(1, 'Seasonal Discount', 10);
  ctx.menu.addDiscount(2, 'Weekend Offer', 12.5);
  for (const [id, name] of [[1, 'Latte'], [2, 'Muffin'], [3, 'Tea']]) ctx.menu.addProduct(id, name, 100);
}
const body = (over = {}) => ({ discountId: 1, startDate: '2026-03-01', endDate: '2026-03-31', appliesToAll: true, ...over });
const fieldsOf = (res) => (res.body.errors || []).map((e) => e.field);

test('empty at first; create copies the definition, defaults to Active, and answers in the legacy shape', async () => {
  signIn();
  menu();
  assert.deepEqual((await api('GET', URL)).body.data, []);
  const res = await api('POST', URL, { json: body() });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const a = res.body.data;
  assert.deepEqual(
    [a.discountName, a.type, a.value, a.startDate, a.endDate, a.status, a.appliesToAll, a.appliesTo, a.productIds, a.productCount],
    ['Seasonal Discount', 'Percentage', 10, '2026-03-01', '2026-03-31', 'Active', true, 'All Products', [], 0],
  );
  assert.deepEqual((await api('GET', `${URL}/${a.id}`)).body.data, a);
});

test('selected products: listed, counted and validated against the Menu; ids are returned in ascending order', async () => {
  signIn();
  menu();
  const a = (await api('POST', URL, { json: body({ discountId: 2, appliesToAll: false, productIds: [3, 1] }) })).body.data;
  assert.deepEqual([a.appliesTo, a.productIds, a.productCount, a.value], ['2 Products', [1, 3], 2, 12.5]);
  assert.equal((await api('POST', URL, { json: body({ appliesToAll: false, productIds: [2] }) })).body.data.appliesTo, '1 Product');
  const missing = await api('POST', URL, { json: body({ appliesToAll: false, productIds: [1, 77] }) });
  assert.equal(missing.status, 400);
  assert.deepEqual(fieldsOf(missing), ['productIds']);
  const noDiscount = await api('POST', URL, { json: body({ discountId: 55 }) });
  assert.deepEqual(fieldsOf(noDiscount), ['discountId']);
});

test('validation: every field is checked and named', async () => {
  signIn();
  menu();
  const bad = async (json, field) => {
    const res = await api('POST', URL, { json });
    assert.equal(res.status, 400, JSON.stringify(json));
    assert.ok(fieldsOf(res).includes(field), `${field} in ${JSON.stringify(res.body.errors)}`);
  };
  await bad(body({ discountId: undefined }), 'discountId');
  await bad(body({ discountId: 0 }), 'discountId');
  await bad(body({ startDate: '2026-02-30' }), 'startDate');
  await bad(body({ endDate: undefined }), 'endDate');
  await bad(body({ startDate: '2026-04-01', endDate: '2026-03-01' }), 'endDate');
  await bad(body({ status: 'Paused' }), 'status');
  await bad(body({ appliesToAll: undefined }), 'appliesToAll');
  await bad(body({ appliesToAll: true, productIds: [1] }), 'productIds');
  await bad(body({ appliesToAll: false, productIds: [] }), 'productIds');
  await bad(body({ appliesToAll: false, productIds: [1, 1] }), 'productIds');
  await bad(body({ appliesToAll: false, productIds: ['x'] }), 'productIds');
  assert.equal((await api('POST', URL, { json: [1] })).status, 400);
  assert.equal((await api('GET', `${URL}/abc`)).status, 400);
  assert.deepEqual((await api('GET', URL)).body.data, [], 'nothing was saved');
});

test('update replaces discount, period and products and keeps the status; setStatus changes only the status; 404 for unknown ids', async () => {
  signIn();
  menu();
  const a = (await api('POST', URL, { json: body({ status: 'Inactive' }) })).body.data;
  const put = await api('PUT', `${URL}/${a.id}`, { json: body({ discountId: 2, startDate: '2026-04-01', endDate: '2026-04-30', appliesToAll: false, productIds: [2] }) });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.deepEqual([put.body.data.discountName, put.body.data.value, put.body.data.status, put.body.data.productIds, put.body.data.startDate], ['Weekend Offer', 12.5, 'Inactive', [2], '2026-04-01']);
  const patched = await api('PATCH', `${URL}/${a.id}/status`, { json: { status: 'Active' } });
  assert.deepEqual([patched.status, patched.body.data.status, patched.body.data.productIds], [200, 'Active', [2]]);
  assert.equal((await api('PATCH', `${URL}/${a.id}/status`, { json: { status: 'Nope' } })).status, 400);
  assert.equal((await api('PATCH', `${URL}/${a.id}/status`, { json: {} })).status, 400);
  assert.equal((await api('PUT', `${URL}/999`, { json: body() })).status, 404);
  assert.equal((await api('PATCH', `${URL}/999/status`, { json: { status: 'Active' } })).status, 404);
  assert.equal((await api('GET', `${URL}/999`)).status, 404);
  assert.equal((await api('DELETE', `${URL}/999`)).status, 404);
});

test('a saved application keeps the copied name and percentage even if the Menu definition later changes or disappears', async () => {
  signIn();
  menu();
  const a = (await api('POST', URL, { json: body() })).body.data;
  ctx.menu.addDiscount(1, 'Renamed', 99);
  ctx.menu.clear();
  const again = (await api('GET', `${URL}/${a.id}`)).body.data;
  assert.deepEqual([again.discountName, again.value], ['Seasonal Discount', 10]);
});

test('list: newest first, paged and searched in name, percentage, applies-to and status', async () => {
  signIn();
  menu();
  await api('POST', URL, { json: body({ discountId: 1 }) });
  await api('POST', URL, { json: body({ discountId: 2, appliesToAll: false, productIds: [1, 2], status: 'Inactive' }) });
  await api('POST', URL, { json: body({ discountId: 1, appliesToAll: false, productIds: [3] }) });
  const names = async (q) => (await api('GET', `${URL}?${q}`)).body.data.map((x) => `${x.discountName}/${x.appliesTo}/${x.status}`);
  assert.deepEqual(await names(''), ['Seasonal Discount/1 Product/Active', 'Weekend Offer/2 Products/Inactive', 'Seasonal Discount/All Products/Active']);
  assert.deepEqual(await names('search=weekend'), ['Weekend Offer/2 Products/Inactive']);
  assert.deepEqual(await names('search=inactive'), ['Weekend Offer/2 Products/Inactive']);
  assert.deepEqual(await names('search=12.5'), ['Weekend Offer/2 Products/Inactive']);
  assert.deepEqual(await names('search=all products'), ['Seasonal Discount/All Products/Active']);
  const page = await api('GET', `${URL}?page=2&limit=2`);
  assert.deepEqual([page.body.data.length, page.body.meta], [1, { total: 3, page: 2, limit: 2, totalPages: 2 }]);
  assert.equal((await api('GET', `${URL}?limit=0`)).status, 400);
});

test('applications are per account; deleting is for the owner only', async () => {
  signIn();
  menu();
  const a = (await api('POST', URL, { json: body() })).body.data;
  const mine = ctx.token;

  ctx.token = tokenFor({ userId: 9, accountId: 2, role: 'owner' });
  assert.deepEqual((await api('GET', URL)).body.data, []);
  for (const [method, url, json] of [['GET', `${URL}/${a.id}`], ['PUT', `${URL}/${a.id}`, body()], ['PATCH', `${URL}/${a.id}/status`, { status: 'Inactive' }], ['DELETE', `${URL}/${a.id}`]]) {
    assert.equal((await api(method, url, { json })).status, 404, `${method} of another account's application`);
  }

  ctx.token = tokenFor({ userId: 2, accountId: 1, role: 'admin' });
  assert.equal((await api('GET', `${URL}/${a.id}`)).status, 200, 'an admin of the account can read it');
  assert.equal((await api('PATCH', `${URL}/${a.id}/status`, { json: { status: 'Inactive' } })).status, 200, 'and change it');
  assert.equal((await api('DELETE', `${URL}/${a.id}`)).status, 403, 'but not delete it');

  ctx.token = mine;
  assert.equal((await api('DELETE', `${URL}/${a.id}`)).status, 200);
  assert.equal((await api('GET', `${URL}/${a.id}`)).status, 404);
});

test('when the Menu Service is down, saving an application fails with 503 and nothing is saved', async () => {
  signIn();
  menu();
  ctx.menu.fail();
  assert.equal((await api('POST', URL, { json: body() })).status, 503);
  ctx.menu.fail(false);
  assert.deepEqual((await api('GET', URL)).body.data, []);
});
