// Orders over HTTP: create (server-side pricing), read, edit while Pending, list/filter/search/page, CSV export, account and
// shop isolation. Products, discounts and shops come from stand-ins for the Menu and Settings services.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { orderRepository } = require('../../repositories');
const { useTestServer } = require('./helpers');

const { ctx, api, signIn, tokenFor } = useTestServer();
const V1 = '/api/v1';

function menu() {
  ctx.menu.addProduct(1, 'Latte', 250);
  ctx.menu.addProduct(2, 'Muffin', 180.5);
  ctx.menu.addProduct(3, 'Tea', 100);
}
const newOrder = (over = {}) => ({ type: 'Dine-In', customerName: 'Sarah', tableLabel: 'T4', items: [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }], ...over });

// Puts an order straight into the repository (a fixed date), like a past sale.
const seed = (shop, over = {}) => orderRepository.create({
  accountId: 1, shopId: shop.id, type: 'Dine-In', status: 'Paid', customerName: 'Walk-in', tableLabel: null, subtotal: 100, discountTotal: 0, total: 100,
  placedAt: '2026-03-21T12:00:00', items: [{ productId: null, name: 'Espresso', unitPrice: 100, quantity: 1, discountPercentage: 0, discountAmount: 0, discountApplicationId: null }], ...over,
});

test('every Sales route needs a signed-in user', async () => {
  for (const [method, url] of [['GET', '/orders'], ['POST', '/orders'], ['GET', '/orders/1'], ['PUT', '/orders/1'], ['GET', '/orders/export'], ['GET', '/reports/sales/summary'], ['GET', '/dashboard/summary'], ['GET', '/discounts/applications']]) {
    const res = await api(method, V1 + url);
    assert.equal(res.status, 401, `${method} ${url}`);
  }
  assert.equal((await api('GET', `${V1}/orders`, { headers: { authorization: 'Bearer nonsense' } })).status, 401);
});

test('create: the server prices the order from the Menu, copies name and price, and starts it as Pending', async () => {
  const shop = signIn();
  menu();
  const res = await api('POST', `${V1}/orders`, { json: newOrder({ total: 1, status: 'Paid', subtotal: 5, items: [{ productId: 1, quantity: 2, unitPrice: 1 }, { productId: 2, quantity: 1 }] }) });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const o = res.body.data;
  assert.deepEqual([o.subtotal, o.discountTotal, o.total, o.status, o.shopId, o.type, o.customer, o.tableLabel], [680.5, 0, 680.5, 'Pending', shop.id, 'Dine-In', 'Sarah', 'T4'], 'client-sent total, status and unitPrice are ignored');
  assert.match(o.orderId, /^#ORD\d+$/);
  assert.equal(o.itemsText, '2x Latte, 1x Muffin');
  assert.deepEqual(o.items.map((i) => [i.name, i.unitPrice, i.quantity]), [['Latte', 250, 2], ['Muffin', 180.5, 1]]);
  assert.equal(typeof o.placedAt, 'string');
  const again = await api('GET', `${V1}/orders/${o.id}`);
  assert.deepEqual(again.body.data, o);
});

test('create: validation errors name the field; nothing is saved', async () => {
  signIn();
  menu();
  const bad = async (json, field) => {
    const res = await api('POST', `${V1}/orders`, { json });
    assert.equal(res.status, 400, JSON.stringify(json));
    assert.ok(res.body.errors.some((e) => e.field === field), `${field} in ${JSON.stringify(res.body.errors)}`);
  };
  await bad(newOrder({ type: 'Drive Thru' }), 'type');
  await bad(newOrder({ type: undefined }), 'type');
  await bad(newOrder({ items: [] }), 'items');
  await bad(newOrder({ items: undefined }), 'items');
  await bad(newOrder({ items: [{ productId: 1, quantity: 0 }] }), 'items[0].quantity');
  await bad(newOrder({ items: [{ productId: 1, quantity: 1.5 }] }), 'items[0].quantity');
  await bad(newOrder({ items: [{ productId: 1, quantity: 1000 }] }), 'items[0].quantity');
  await bad(newOrder({ items: [{ productId: '1', quantity: 1 }] }), 'items[0].productId');
  await bad(newOrder({ items: [{ productId: 1, quantity: 1 }, { productId: 1, quantity: 2 }] }), 'items[1].productId');
  await bad(newOrder({ items: [{ productId: 99, quantity: 1 }] }), 'items');
  await bad(newOrder({ type: 'Take Away', tableLabel: 'T4' }), 'tableLabel');
  await bad(newOrder({ customerName: 'x'.repeat(101) }), 'customerName');
  await bad(newOrder({ shopId: 'abc' }), 'shopId');
  assert.equal((await api('POST', `${V1}/orders`, { json: [1] })).status, 400);
  assert.deepEqual((await api('GET', `${V1}/orders`)).body.data, []);
});

test('create: a total above the DECIMAL(10,2) limit is refused (no overflow, no silent change)', async () => {
  signIn();
  ctx.menu.addProduct(1, 'Gold', 99999999.99);
  const res = await api('POST', `${V1}/orders`, { json: { type: 'Take Away', items: [{ productId: 1, quantity: 2 }] } });
  assert.equal(res.status, 400);
  assert.equal(res.body.message, 'The order total is too large');
});

test('create: needs a shop of the account (409), a requested shop must be the account\'s own (404)', async () => {
  signIn({ userId: 1, accountId: 1, role: 'owner' }, { shop: false });
  menu();
  assert.equal((await api('POST', `${V1}/orders`, { json: newOrder() })).status, 409);
  const other = ctx.settings.addShop(2, 'Someone else');
  assert.equal((await api('POST', `${V1}/orders`, { json: newOrder({ shopId: other.id }) })).status, 404);
  const own = ctx.settings.addShop(1, 'Second');
  const ok = await api('POST', `${V1}/orders`, { json: newOrder({ shopId: own.id }) });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.shopId, own.id);
});

test('create: when the Menu or Settings Service is down the order fails with 503 and nothing is saved', async () => {
  signIn();
  menu();
  ctx.menu.fail();
  assert.equal((await api('POST', `${V1}/orders`, { json: newOrder() })).status, 503);
  ctx.menu.fail(false);
  ctx.settings.fail();
  assert.equal((await api('POST', `${V1}/orders`, { json: newOrder() })).status, 503);
  ctx.settings.fail(false);
  assert.deepEqual((await api('GET', `${V1}/orders`)).body.data, []);
});

test('an Active discount application whose period includes today is applied automatically (largest percentage, no stacking)', async () => {
  signIn();
  menu();
  ctx.menu.addDiscount(1, 'Ten', 10);
  ctx.menu.addDiscount(2, 'Twenty', 20);
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = (offset) => iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset));
  const make = (json) => api('POST', `${V1}/discounts/applications`, { json });
  const ten = (await make({ discountId: 1, startDate: day(-1), endDate: day(1), appliesToAll: true })).body.data;
  await make({ discountId: 2, startDate: day(-1), endDate: day(1), appliesToAll: false, productIds: [1], status: 'Inactive' }); // inactive: ignored
  await make({ discountId: 2, startDate: day(2), endDate: day(3), appliesToAll: true }); // future: ignored
  await make({ discountId: 2, startDate: day(-5), endDate: day(-2), appliesToAll: true }); // past: ignored
  const res = await api('POST', `${V1}/orders`, { json: { type: 'Take Away', items: [{ productId: 1, quantity: 2 }, { productId: 3, quantity: 1 }] } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.deepEqual([res.body.data.subtotal, res.body.data.discountTotal, res.body.data.total], [600, 60, 540]);
  assert.deepEqual(res.body.data.items.map((i) => [i.discountPercentage, i.discountAmount, i.discountApplicationId]), [[10, 50, ten.id], [10, 10, ten.id]]);

  const twenty = (await make({ discountId: 2, startDate: day(0), endDate: day(0), appliesToAll: false, productIds: [1] })).body.data;
  const best = await api('POST', `${V1}/orders`, { json: { type: 'Take Away', items: [{ productId: 1, quantity: 1 }, { productId: 3, quantity: 1 }] } });
  assert.deepEqual(best.body.data.items.map((i) => [i.discountPercentage, i.discountApplicationId]), [[20, twenty.id], [10, ten.id]], 'each line gets the largest eligible percentage, not both');
  assert.deepEqual([best.body.data.subtotal, best.body.data.discountTotal, best.body.data.total], [350, 60, 290]);
});

test('edit: replaces type, customer, table and lines while the order is Pending, and prices it again', async () => {
  signIn();
  menu();
  const created = (await api('POST', `${V1}/orders`, { json: newOrder() })).body.data;
  ctx.menu.addProduct(2, 'Muffin', 200); // the Menu price changed since
  const res = await api('PUT', `${V1}/orders/${created.id}`, { json: { type: 'Take Away', customerName: 'Anita', items: [{ productId: 3, quantity: 4 }, { productId: 2, quantity: 1 }] } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const o = res.body.data;
  assert.deepEqual([o.id, o.orderId, o.type, o.customer, o.tableLabel, o.subtotal, o.total, o.status, o.placedAt], [created.id, created.orderId, 'Take Away', 'Anita', null, 600, 600, 'Pending', created.placedAt]);
  assert.deepEqual(o.items.map((i) => [i.name, i.unitPrice, i.quantity]), [['Tea', 100, 4], ['Muffin', 200, 1]]);
  assert.deepEqual((await api('GET', `${V1}/orders/${created.id}`)).body.data, o);
  assert.equal((await api('PUT', `${V1}/orders/${created.id}`, { json: { type: 'Take Away', items: [] } })).status, 400);
  assert.equal((await api('PUT', `${V1}/orders/9999`, { json: newOrder() })).status, 404);
});

test('edit: an order that is no longer Pending cannot be changed (409); orders cannot be deleted or cancelled over HTTP', async () => {
  const shop = signIn();
  menu();
  const paid = await seed(shop, { status: 'Paid' });
  const res = await api('PUT', `${V1}/orders/${paid.id}`, { json: newOrder() });
  assert.equal(res.status, 409);
  assert.equal(res.body.message, 'Only a Pending order can be changed');
  assert.equal((await api('DELETE', `${V1}/orders/${paid.id}`)).status, 404, 'there is no delete route');
  assert.equal((await api('PATCH', `${V1}/orders/${paid.id}/status`, { json: { status: 'Cancelled' } })).status, 400, 'cancelling is not available');
});

test('orders of another account are invisible: 404 on read and edit, absent from lists, exports and summaries', async () => {
  const shop = signIn();
  menu();
  const mine = (await api('POST', `${V1}/orders`, { json: newOrder() })).body.data;
  ctx.token = tokenFor({ userId: 5, accountId: 2, role: 'owner' });
  ctx.settings.addShop(2, 'Other');
  assert.equal((await api('GET', `${V1}/orders/${mine.id}`)).status, 404);
  assert.equal((await api('PUT', `${V1}/orders/${mine.id}`, { json: newOrder() })).status, 404);
  assert.deepEqual((await api('GET', `${V1}/orders`)).body.data, []);
  assert.equal((await api('GET', `${V1}/reports/sales/summary`)).body.data.totalOrders, 0);
  assert.equal((await api('GET', `${V1}/orders?shopId=${shop.id}`)).status, 404, 'a shop of another account is not even acknowledged');
  assert.equal((await api('GET', `${V1}/orders/export`)).text.trim().split('\r\n').length, 1, 'header only');
});

test('list: newest first, paged, filtered by date range and shop, searched in id, type, customer, items, status and time', async () => {
  const shop = signIn();
  const second = ctx.settings.addShop(1, 'Second shop');
  await seed(shop, { customerName: 'Sarah Jenkins', type: 'Take Away', status: 'Paid', placedAt: '2026-03-21T12:55:00', items: [{ name: 'Iced Latte', unitPrice: 5, quantity: 1, productId: null, discountPercentage: 0, discountAmount: 0, discountApplicationId: null }, { name: 'Muffin', unitPrice: 5, quantity: 1, productId: null, discountPercentage: 0, discountAmount: 0, discountApplicationId: null }], total: 840 });
  await seed(shop, { customerName: 'Michael Chen', status: 'Preparing', placedAt: '2026-03-21T12:48:00', total: 180 });
  await seed(shop, { customerName: 'Anita Sharma', status: 'Delivered', placedAt: '2026-03-22T19:10:00', total: 1240 });
  await seed(second, { customerName: 'Elsewhere', status: 'Pending', placedAt: '2026-04-01T10:00:00', total: 250 });

  const all = (await api('GET', `${V1}/orders`)).body;
  assert.deepEqual(all.data.map((o) => o.customer), ['Elsewhere', 'Anita Sharma', 'Sarah Jenkins', 'Michael Chen']);
  assert.deepEqual(all.meta, { total: 4, page: 1, limit: 10, totalPages: 1 });
  const paged = await api('GET', `${V1}/orders?page=2&limit=3`);
  assert.deepEqual(paged.body.data.map((o) => o.customer), ['Michael Chen']);
  assert.deepEqual(paged.body.meta, { total: 4, page: 2, limit: 3, totalPages: 2 });
  assert.deepEqual((await api('GET', `${V1}/orders?from=2026-03-21&to=2026-03-21`)).body.data.map((o) => o.customer), ['Sarah Jenkins', 'Michael Chen']);
  assert.deepEqual((await api('GET', `${V1}/orders?shopId=${second.id}`)).body.data.map((o) => o.customer), ['Elsewhere']);
  for (const [search, expected] of [['sarah', ['Sarah Jenkins']], ['take away', ['Sarah Jenkins']], ['2x', []], ['iced latte', ['Sarah Jenkins']], ['preparing', ['Michael Chen']], ['7:10 PM', ['Anita Sharma']], ['#ORD', ['Elsewhere', 'Anita Sharma', 'Sarah Jenkins', 'Michael Chen']]]) {
    assert.deepEqual((await api('GET', `${V1}/orders?search=${encodeURIComponent(search)}`)).body.data.map((o) => o.customer), expected, `search ${search}`);
  }
  for (const q of ['from=2026-02-30', 'to=abc', 'from=2026-03-22&to=2026-03-21', 'page=0', 'limit=101', 'shopId=0', `search=${'x'.repeat(101)}`]) {
    assert.equal((await api('GET', `${V1}/orders?${q}`)).status, 400, q);
  }
});

test('export: CSV with a byte order mark and quoted cells, the same filters as the list; pdf and xls answer 501; formulas are neutralised', async () => {
  const shop = signIn();
  await seed(shop, { customerName: '=HYPERLINK("x")', type: 'Take Away', status: 'Paid', total: 840, placedAt: '2026-03-21T12:55:00' });
  await seed(shop, { customerName: 'Later', placedAt: '2026-05-01T08:00:00', total: 5 });
  const csv = await api('GET', `${V1}/orders/export?from=2026-03-21&to=2026-03-21`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.headers.get('content-disposition'), /sales-orders\.csv/);
  assert.deepEqual([...csv.bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const lines = csv.text.slice(1).trim().split('\r\n');
  assert.equal(lines[0], '"Order ID","Order Type","Customer","Items","Total","Status","Time","Date"');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^"#ORD\d+","Take Away","'=HYPERLINK\(""x""\)","1x Espresso","840","Paid","12:55 PM","2026-03-21"$/);
  for (const format of ['pdf', 'xls']) assert.equal((await api('GET', `${V1}/orders/export?format=${format}`)).status, 501, format);
  assert.equal((await api('GET', `${V1}/orders/export?format=docx`)).status, 400);
});
