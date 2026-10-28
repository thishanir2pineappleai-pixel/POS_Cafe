// Sales summary and Dashboard over HTTP. Orders are seeded through the repository with fixed dates (like past sales); numbers
// must come only from real orders, scoped to the account (and one shop for the Dashboard).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { orderRepository } = require('../../repositories');
const { useTestServer } = require('./helpers');

const { ctx, api, signIn, tokenFor } = useTestServer();
const V1 = '/api/v1';

const line = (name, quantity, unitPrice, productId = null) => ({ productId, name, unitPrice, quantity, discountPercentage: 0, discountAmount: 0, discountApplicationId: null });
let shop;
const seed = (over) => orderRepository.create({
  accountId: 1, shopId: shop.id, type: 'Dine-In', status: 'Paid', customerName: 'Walk-in', tableLabel: null, subtotal: 100, discountTotal: 0, total: 100,
  placedAt: '2026-03-21T12:00:00', items: [line('Espresso', 1, 100)], ...over,
});

// Day A (2026-03-21): 5 orders, 3 of them in the 19:00 hour. Day B (03-22): 1 order. Day C (04-01): 1 order.
async function seedOrders() {
  await seed({ type: 'Take Away', total: 840, status: 'Paid', placedAt: '2026-03-21T12:55:00', items: [line('Iced Latte', 1, 440, 1), line('Muffin', 1, 400, 2)] });
  await seed({ total: 180, status: 'Preparing', placedAt: '2026-03-21T12:48:00', items: [line('Filter Coffee', 1, 180)] });
  await seed({ total: 1240, status: 'Paid', placedAt: '2026-03-21T19:10:00', tableLabel: 'T4', items: [line('Cappuccino', 3, 240, 3), line('Croissants', 2, 260)] });
  await seed({ type: 'Take Away', total: 5840, status: 'Cancelled', placedAt: '2026-03-21T19:40:00', items: [line('Cappuccino', 1, 5840, 3)] });
  await seed({ total: 500, status: 'Delivered', placedAt: '2026-03-21T19:50:00', items: [line('Tea', 2, 250)] });
  await seed({ type: 'Take Away', total: 300, status: 'Pending', placedAt: '2026-03-22T08:05:00', items: [line('Mocha', 1, 300)] });
  await seed({ total: 250, status: 'Paid', placedAt: '2026-04-01T10:00:00', items: [line('Latte', 1, 250)] });
}

const begin = () => { shop = signIn(); };

test('with no orders every number is empty or zero (nothing is invented)', async () => {
  begin();
  const summary = await api('GET', `${V1}/reports/sales/summary`);
  assert.equal(summary.status, 200);
  assert.deepEqual(summary.body.data, { range: { from: null, to: null }, totalRevenue: 0, totalOrders: 0, newCustomers: 0, peakHour: null });
  const d = (path) => api('GET', `${V1}/dashboard/${path}?date=2026-03-21`).then((r) => r.body.data);
  assert.deepEqual((await d('summary')), { date: '2026-03-21', shopId: shop.id, sales: { value: 0, changePercent: null }, orders: { value: 0, changePercent: null }, newCustomers: { value: 0, changePercent: null }, peakHours: null });
  assert.deepEqual((await d('order-status')).statuses.map((s) => s.count), [0, 0, 0, 0, 0]);
  assert.deepEqual((await d('top-selling')).items, []);
  assert.deepEqual((await d('recent-orders')).orders, []);
  assert.equal((await d('sales-trend')).total, 0);
});

test('summary: revenue excludes Cancelled orders, total orders counts all, peak hour is the busiest clock hour', async () => {
  begin();
  await seedOrders();
  assert.deepEqual((await api('GET', `${V1}/reports/sales/summary?from=2026-03-21&to=2026-03-21`)).body.data, {
    range: { from: '2026-03-21', to: '2026-03-21' },
    totalRevenue: 2760, // 840 + 180 + 1240 + 500, the cancelled 5840 is left out
    totalOrders: 5,
    newCustomers: 0,
    peakHour: { startHour: 19, endHour: 20, orders: 3, label: '7:00 PM – 8:00 PM' },
  });
  assert.equal((await api('GET', `${V1}/reports/sales/summary`)).body.data.totalOrders, 7);
  assert.equal((await api('GET', `${V1}/reports/sales/summary?from=2026-03-22`)).body.data.totalOrders, 2);
  assert.equal((await api('GET', `${V1}/reports/sales/summary?shopId=${shop.id}`)).status, 200);
  assert.equal((await api('GET', `${V1}/reports/sales/summary?shopId=777`)).status, 404);
  for (const q of ['from=nope', 'to=2026-13-01', 'from=2026-03-22&to=2026-03-21']) assert.equal((await api('GET', `${V1}/reports/sales/summary?${q}`)).status, 400, q);
});

test('summary and totals add up exactly in cents', async () => {
  begin();
  await seed({ total: 0.1, placedAt: '2026-03-21T10:00:00' });
  await seed({ total: 0.2, placedAt: '2026-03-21T10:05:00' });
  assert.equal((await api('GET', `${V1}/reports/sales/summary`)).body.data.totalRevenue, 0.3);
});

test('dashboard summary: today versus yesterday with the percentage change', async () => {
  begin();
  await seedOrders();
  await seed({ total: 1000, placedAt: '2026-03-20T10:00:00' });
  const d = (await api('GET', `${V1}/dashboard/summary?date=2026-03-21`)).body.data;
  assert.deepEqual([d.sales, d.orders, d.peakHours.startHour], [{ value: 2760, changePercent: 176 }, { value: 5, changePercent: 400 }, 19]);
});

test('dashboard order-status always lists all five statuses; top-selling ignores cancelled orders and ranks by quantity', async () => {
  begin();
  await seedOrders();
  const status = (await api('GET', `${V1}/dashboard/order-status?date=2026-03-21`)).body.data;
  assert.deepEqual(status.statuses, [{ status: 'Paid', count: 2 }, { status: 'Preparing', count: 1 }, { status: 'Pending', count: 0 }, { status: 'Delivered', count: 1 }, { status: 'Cancelled', count: 1 }]);
  ctx.menu.addProduct(3, 'Cappuccino (current)', 275, 'Coffee');
  const top = (await api('GET', `${V1}/dashboard/top-selling?date=2026-03-21&limit=2`)).body.data;
  assert.deepEqual(top.items.map((i) => [i.name, i.sold, i.category, i.price]), [['Cappuccino (current)', 3, 'Coffee', 275], ['Croissants', 2, null, 260]]);
  assert.equal(top.items.length, 2);
  assert.equal((await api('GET', `${V1}/dashboard/top-selling?date=2026-03-21&period=week`)).body.data.period, 'week');
  assert.equal((await api('GET', `${V1}/dashboard/top-selling?period=year`)).status, 400);
  assert.equal((await api('GET', `${V1}/dashboard/top-selling?limit=21`)).status, 400);
});

test('dashboard sales-trend buckets by hour, weekday and month; cancelled orders earn nothing', async () => {
  begin();
  await seedOrders();
  const day = (await api('GET', `${V1}/dashboard/sales-trend?date=2026-03-21`)).body.data;
  assert.deepEqual(day.points.map((p) => [p.label, p.value]), [['06:00 AM', 0], ['09:00 AM', 0], ['12:00 PM', 1020], ['15:00 PM', 0], ['18:00 PM', 1740], ['21:00 PM', 0], ['12:00 AM', 0]]);
  assert.equal(day.total, 2760);
  const week = (await api('GET', `${V1}/dashboard/sales-trend?date=2026-03-21&period=week`)).body.data;
  assert.deepEqual(week.points.map((p) => p.label), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  assert.deepEqual([week.points[5].value, week.points[6].value, week.total], [2760, 300, 3060]); // Sat 03-21, Sun 03-22
  const month = (await api('GET', `${V1}/dashboard/sales-trend?date=2026-03-21&period=month`)).body.data;
  assert.deepEqual([month.points[2].value, month.points[3].value, month.points.length], [3060, 250, 12]);
});

test('dashboard recent-orders: newest first, limited, with the table of dine-in orders', async () => {
  begin();
  await seedOrders();
  const recent = (await api('GET', `${V1}/dashboard/recent-orders?limit=2`)).body.data;
  assert.equal(recent.shopId, shop.id);
  assert.deepEqual(recent.orders.map((o) => [o.date, o.status, o.total]), [['2026-04-01', 'Paid', 250], ['2026-03-22', 'Pending', 300]]);
  const dinein = (await api('GET', `${V1}/dashboard/recent-orders?limit=20`)).body.data.orders.find((o) => o.total === 1240);
  assert.deepEqual([dinein.tableId, dinein.itemsText, dinein.time], ['T4', '3x Cappuccino, 2x Croissants', '7:10 PM']);
});

test('dashboard is limited to ONE shop of the account: the first by default, another with shopId, 404 for a foreign shop', async () => {
  begin();
  const second = ctx.settings.addShop(1, 'Second');
  await seed({ total: 100, placedAt: '2026-03-21T10:00:00' });
  await seed({ total: 900, shopId: second.id, placedAt: '2026-03-21T10:00:00' });
  const first = (await api('GET', `${V1}/dashboard/summary?date=2026-03-21`)).body.data;
  assert.deepEqual([first.shopId, first.sales.value], [shop.id, 100]);
  const other = (await api('GET', `${V1}/dashboard/summary?date=2026-03-21&shopId=${second.id}`)).body.data;
  assert.deepEqual([other.shopId, other.sales.value], [second.id, 900]);
  ctx.settings.addShop(2, 'Foreign');
  assert.equal((await api('GET', `${V1}/dashboard/summary?shopId=3`)).status, 404);
});

test('an account without a shop gets empty dashboard data (shopId null), never another account\'s numbers', async () => {
  begin();
  await seed({ total: 100, placedAt: '2026-03-21T10:00:00' });
  ctx.token = tokenFor({ userId: 8, accountId: 3, role: 'owner' });
  const d = (await api('GET', `${V1}/dashboard/summary?date=2026-03-21`)).body.data;
  assert.deepEqual([d.shopId, d.sales.value, d.orders.value], [null, 0, 0]);
});

test('dashboard stock comes from the Menu Service (menu products, not ingredients); a Menu outage is a 503', async () => {
  begin();
  const stock = { source: 'menu_products', counts: { outOfStock: 1, lowStock: 1, inStock: 2 }, items: [{ id: 5, code: '#PRD5', name: 'Beans', category: 'Coffee', quantity: 0, lowStockAlert: 5, status: 'Out of stock' }] };
  ctx.menu.setStock(stock);
  assert.deepEqual((await api('GET', `${V1}/dashboard/stock`)).body.data, stock);
  ctx.menu.fail();
  assert.equal((await api('GET', `${V1}/dashboard/stock`)).status, 503);
});
