// The order lifecycle over HTTP: the barista moves an order Pending -> Preparing -> Delivered (BRD BR-04), recording a cash or
// card payment on a Delivered order makes it Paid (BRD BR-05). Cancellation and refunds are NOT available: no rule defines them.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { orderRepository } = require('../../repositories');
const { useTestServer } = require('./helpers');

const { ctx, api, signIn, tokenFor } = useTestServer();
const V1 = '/api/v1';

async function place() {
  ctx.menu.addProduct(1, 'Latte', 250.5);
  ctx.menu.addProduct(2, 'Muffin', 180);
  const res = await api('POST', `${V1}/orders`, { json: { type: 'Dine-In', tableLabel: 'T1', items: [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }] } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}
const status = (id, to) => api('PATCH', `${V1}/orders/${id}/status`, { json: { status: to } });
const pay = (id, json = { method: 'Cash' }) => api('POST', `${V1}/orders/${id}/payments`, { json });

test('the happy path: Pending -> Preparing -> Delivered -> Paid, with the payment recorded at the order total', async () => {
  signIn();
  const order = await place();
  assert.equal(order.status, 'Pending');
  assert.equal(order.payment, null);

  const preparing = await status(order.id, 'Preparing');
  assert.deepEqual([preparing.status, preparing.body.data.status, preparing.body.message], [200, 'Preparing', 'Order status updated']);
  assert.equal((await status(order.id, 'Delivered')).body.data.status, 'Delivered');

  const paid = await pay(order.id, { method: 'Card' });
  assert.equal(paid.status, 201, JSON.stringify(paid.body));
  assert.equal(paid.body.data.status, 'Paid');
  assert.deepEqual([paid.body.data.payment.method, paid.body.data.payment.amount, paid.body.data.payment.recordedBy, typeof paid.body.data.payment.paidAt], ['Card', 681, 1, 'string']);
  assert.equal(paid.body.data.payment.amount, order.total, 'the amount is the order total');
  assert.deepEqual((await api('GET', `${V1}/orders/${order.id}`)).body.data, paid.body.data);
  assert.equal((await api('GET', `${V1}/orders?search=paid`)).body.data[0].payment.method, 'Card');
});

test('only the allowed steps work; everything else is a 409 that names the transition', async () => {
  signIn();
  const order = await place();
  for (const to of ['Delivered']) {
    const res = await status(order.id, to);
    assert.equal(res.status, 409, `Pending -> ${to}`);
    assert.equal(res.body.errors[0].message, `Pending -> ${to} is not allowed`);
  }
  await status(order.id, 'Preparing');
  assert.equal((await status(order.id, 'Preparing')).status, 409, 'no repeating a step');
  await status(order.id, 'Delivered');
  assert.equal((await status(order.id, 'Preparing')).status, 409, 'no going back');
  assert.equal((await status(order.id, 'Delivered')).status, 409);
  assert.equal((await api('GET', `${V1}/orders/${order.id}`)).body.data.status, 'Delivered');
});

test('the status route refuses Paid, Cancelled and unknown values with an explanation (400), and unknown orders are 404', async () => {
  signIn();
  const order = await place();
  const bad = async (json) => (await api('PATCH', `${V1}/orders/${order.id}/status`, { json }));
  assert.match((await bad({ status: 'Paid' })).body.errors[0].message, /payment is recorded/);
  assert.match((await bad({ status: 'Cancelled' })).body.errors[0].message, /not available/);
  for (const json of [{ status: 'Pending' }, { status: 'nope' }, {}, []]) assert.equal((await bad(json)).status, 400, JSON.stringify(json));
  assert.equal((await status(9999, 'Preparing')).status, 404);
  assert.equal((await api('PATCH', `${V1}/orders/abc/status`, { json: { status: 'Preparing' } })).status, 400);
  assert.equal((await api('GET', `${V1}/orders/${order.id}`)).body.data.status, 'Pending', 'nothing changed');
  for (const method of ['DELETE']) assert.equal((await api(method, `${V1}/orders/${order.id}`)).status, 404, 'there is no way to delete or cancel an order');
});

test('payment: only a Delivered order, once, by cash or card, and never with an amount from the client', async () => {
  signIn();
  const order = await place();
  assert.equal((await pay(order.id)).status, 409, 'Pending is not payable');
  assert.equal((await pay(order.id)).body.message, 'Only a Delivered order can be paid');
  await status(order.id, 'Preparing');
  assert.equal((await pay(order.id)).status, 409, 'Preparing is not payable');
  await status(order.id, 'Delivered');
  for (const json of [{}, { method: 'Bitcoin' }, { method: 'cash' }, []]) assert.equal((await pay(order.id, json)).status, 400, JSON.stringify(json));
  const ok = await pay(order.id, { method: 'Cash', amount: 1, total: 1 });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.payment.amount, 681, 'a client-sent amount is ignored');
  const again = await pay(order.id);
  assert.equal(again.status, 409);
  assert.equal(again.body.message, 'The order is already paid');
  assert.equal((await status(order.id, 'Preparing')).status, 409, 'a paid order cannot move again');
  assert.equal((await api('PUT', `${V1}/orders/${order.id}`, { json: { type: 'Take Away', items: [{ productId: 1, quantity: 1 }] } })).status, 409, 'nor be edited');
  assert.equal((await pay(9999)).status, 404);
});

test('two requests racing for the same step: exactly one wins, the other gets a 409 (no double payment)', async () => {
  signIn();
  const order = await place();
  await status(order.id, 'Preparing');
  const both = await Promise.all([status(order.id, 'Delivered'), status(order.id, 'Delivered')]);
  assert.deepEqual(both.map((r) => r.status).sort(), [200, 409]);
  const payments = await Promise.all([pay(order.id), pay(order.id), pay(order.id)]);
  assert.deepEqual(payments.map((r) => r.status).sort(), [201, 409, 409]);
  assert.equal((await api('GET', `${V1}/orders/${order.id}`)).body.data.payment.amount, 681);
});

test('a zero-total order (fully discounted) can still be completed and paid, at 0', async () => {
  signIn();
  ctx.menu.addProduct(1, 'Free', 100);
  ctx.menu.addDiscount(1, 'Everything', 100);
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = (o) => iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + o));
  await api('POST', `${V1}/discounts/applications`, { json: { discountId: 1, startDate: day(-1), endDate: day(1), appliesToAll: true } });
  const order = (await api('POST', `${V1}/orders`, { json: { type: 'Take Away', items: [{ productId: 1, quantity: 1 }] } })).body.data;
  assert.equal(order.total, 0);
  await status(order.id, 'Preparing');
  await status(order.id, 'Delivered');
  assert.equal((await pay(order.id)).body.data.payment.amount, 0);
});

test('other accounts get 404 for every lifecycle route; paid orders count in the summary and the dashboard status strip', async () => {
  signIn();
  const order = await place();
  await status(order.id, 'Preparing');
  await status(order.id, 'Delivered');
  ctx.token = tokenFor({ userId: 9, accountId: 2, role: 'owner' });
  ctx.settings.addShop(2, 'Other');
  assert.equal((await status(order.id, 'Preparing')).status, 404);
  assert.equal((await pay(order.id)).status, 404);

  ctx.token = tokenFor({ userId: 2, accountId: 1, role: 'admin' });
  assert.equal((await pay(order.id)).status, 201, 'an admin of the account may record the payment');
  assert.equal((await api('GET', `${V1}/orders/${order.id}`)).body.data.payment.recordedBy, 2, 'and is recorded as who did it');
  const today = (await api('GET', `${V1}/dashboard/order-status`)).body.data.statuses;
  assert.deepEqual(today.find((s) => s.status === 'Paid'), { status: 'Paid', count: 1 });
  assert.equal((await api('GET', `${V1}/reports/sales/summary`)).body.data.totalRevenue, 681);
});

test('the repository refuses a stale transition: the guard is in the data layer, not only the service', async () => {
  const shop = signIn();
  const order = await orderRepository.create({
    accountId: 1, shopId: shop.id, type: 'Dine-In', status: 'Pending', customerName: null, tableLabel: null, subtotal: 5, discountTotal: 0, total: 5,
    placedAt: '2026-03-21T12:00:00', items: [{ productId: null, name: 'X', unitPrice: 5, quantity: 1, discountPercentage: 0, discountAmount: 0, discountApplicationId: null }],
  });
  assert.equal(await orderRepository.transition(order.id, { accountId: 1 }, { from: 'Preparing', to: 'Delivered' }), null);
  assert.equal(await orderRepository.pay(order.id, { accountId: 1 }, { from: 'Delivered', to: 'Paid', payment: { method: 'Cash', amount: 5, paidAt: '2026-03-21T12:30:00', recordedBy: 1 } }), null);
  assert.equal((await orderRepository.findById(order.id, { accountId: 1 })).payment, null, 'no payment row was written');
});
