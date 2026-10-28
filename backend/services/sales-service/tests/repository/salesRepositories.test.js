// The Sales repository contract (orders and discount applications), run against the in-memory driver ALWAYS and against MySQL
// (Prisma) when SALES_TEST_DATABASE_URL points at a database whose name ends in _test (its tables are emptied). Both drivers
// must behave the same, because the service cannot tell them apart.
const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { testDatabase } = require('@pos-cafe/shared/testing/database');

const db = testDatabase('SALES_TEST_DATABASE_URL');
const drivers = [{
  name: 'memory',
  load: () => ({
    orders: require('../../repositories/memory/orderRepository'),
    apps: require('../../repositories/memory/discountApplicationRepository'),
    reset: require('../../repositories/memory/store').reset,
  }),
}];
if (db) {
  drivers.push({
    name: 'prisma (MySQL test database)',
    load: () => {
      process.env.REPOSITORY_DRIVER = 'prisma';
      process.env.SALES_DATABASE_URL = db.url;
      const { prisma } = require('../../repositories/prisma/client');
      return {
        orders: require('../../repositories/prisma/orderRepository'),
        apps: require('../../repositories/prisma/discountApplicationRepository'),
        reset: async () => {
          await prisma.payment.deleteMany();
          await prisma.orderItem.deleteMany();
          await prisma.order.deleteMany();
          await prisma.discountApplicationProduct.deleteMany();
          await prisma.discountApplication.deleteMany();
        },
        close: () => prisma.$disconnect(),
      };
    },
  });
}

const item = (name, quantity, unitPrice, over = {}) => ({ productId: null, name, unitPrice, quantity, discountPercentage: 0, discountAmount: 0, discountApplicationId: null, ...over });
const order = (over = {}) => ({
  accountId: 1, shopId: 1, type: 'Dine-In', status: 'Pending', customerName: 'Sarah', tableLabel: 'T1', subtotal: 100, discountTotal: 0, total: 100,
  placedAt: '2026-03-21T12:00:00', items: [item('Espresso', 1, 100)], ...over,
});
const application = (over = {}) => ({
  accountId: 1, discountId: 3, discountName: 'Seasonal', discountPercentage: 7.5, startDate: '2026-03-01', endDate: '2026-03-31', status: 'Active', appliesToAll: false, productIds: [4, 9], ...over,
});

for (const driver of drivers) {
  describe(`Sales repositories: ${driver.name}`, () => {
    let r; let reset; let close;
    before(() => { const loaded = driver.load(); ({ reset, close } = loaded); r = loaded; });
    after(async () => { await reset(); if (close) await close(); });
    beforeEach(async () => { await reset(); });

    test('orders: create returns the whole row with #ORD<id>, copied lines in order and exact money', async () => {
      const lines = [item('Latte', 2, 250.5, { productId: 7, discountPercentage: 10, discountAmount: 50.1, discountApplicationId: 3 }), item('Muffin', 1, 0.07)];
      const created = await r.orders.create(order({ customerName: null, tableLabel: null, subtotal: 501.07, discountTotal: 50.1, total: 450.97, items: lines }));
      assert.equal(created.orderNumber, `#ORD${created.id}`);
      assert.deepEqual(
        [created.accountId, created.shopId, created.type, created.status, created.customerId, created.customerName, created.tableLabel, created.subtotal, created.discountTotal, created.total, created.placedAt],
        [1, 1, 'Dine-In', 'Pending', null, null, null, 501.07, 50.1, 450.97, '2026-03-21T12:00:00'],
      );
      assert.deepEqual(created.items, lines);
      assert.deepEqual([typeof created.createdAt, typeof created.updatedAt], ['string', 'string']);
      assert.deepEqual(await r.orders.findById(created.id, { accountId: 1 }), created, 'findById returns the same row');
      assert.equal(await r.orders.findById(created.id, { accountId: 2 }), null, 'another account sees nothing');
      assert.equal(await r.orders.findById(created.id + 999, { accountId: 1 }), null);
    });

    test('orders: two orders never get the same number, even in different shops', async () => {
      const a = await r.orders.create(order());
      const b = await r.orders.create(order({ shopId: 2 }));
      assert.notEqual(a.orderNumber, b.orderNumber);
    });

    test('orders: update replaces the lines and money in one go, keeps the number, time and status; null for another account', async () => {
      const created = await r.orders.create(order());
      const lines = [item('Tea', 3, 100), item('Cake', 1, 55.55)];
      const updated = await r.orders.update(created.id, { accountId: 1 }, { type: 'Take Away', customerName: 'Anita', tableLabel: null, subtotal: 355.55, discountTotal: 0, total: 355.55, items: lines });
      assert.deepEqual([updated.orderNumber, updated.placedAt, updated.status, updated.type, updated.customerName, updated.tableLabel, updated.total], [created.orderNumber, created.placedAt, 'Pending', 'Take Away', 'Anita', null, 355.55]);
      assert.deepEqual(updated.items, lines);
      assert.deepEqual((await r.orders.findById(created.id, { accountId: 1 })).items, lines, 'the old line is gone');
      assert.equal(await r.orders.update(created.id, { accountId: 2 }, { type: 'Take Away', subtotal: 1, discountTotal: 0, total: 1, items: [item('X', 1, 1)] }), null);
      assert.equal(await r.orders.update(created.id + 999, { accountId: 1 }, { type: 'Take Away', subtotal: 1, discountTotal: 0, total: 1, items: [item('X', 1, 1)] }), null);
    });

    test('orders: an update guarded by a status changes nothing when the order has moved on (no edit after Pending)', async () => {
      const created = await r.orders.create(order());
      const edit = { type: 'Take Away', customerName: 'Late', tableLabel: null, subtotal: 9, discountTotal: 0, total: 9, items: [item('Late line', 1, 9)] };
      assert.ok(await r.orders.transition(created.id, { accountId: 1 }, { from: 'Pending', to: 'Preparing' }));
      assert.equal(await r.orders.update(created.id, { accountId: 1, status: 'Pending' }, edit), null, 'refused: the order is Preparing now');
      const untouched = await r.orders.findById(created.id, { accountId: 1 });
      assert.deepEqual([untouched.status, untouched.customerName, untouched.total, untouched.items.map((i) => i.name)], ['Preparing', 'Sarah', 100, ['Espresso']], 'type, customer, money and lines are as before');
      const fresh = await r.orders.create(order());
      assert.equal((await r.orders.update(fresh.id, { accountId: 1, status: 'Pending' }, edit)).customerName, 'Late', 'still Pending: the guarded update goes through');
    });

    test('orders: list is newest first, paged, scoped to the account and shop, and filtered by date range and text', async () => {
      await r.orders.create(order({ customerName: 'Sarah Jenkins', placedAt: '2026-03-21T12:55:00', items: [item('Iced Latte', 1, 5), item('Muffin', 1, 5)] }));
      await r.orders.create(order({ customerName: 'Michael Chen', status: 'Preparing', placedAt: '2026-03-21T12:48:00' }));
      await r.orders.create(order({ customerName: 'Anita', placedAt: '2026-03-22T19:10:00' }));
      await r.orders.create(order({ customerName: 'Other shop', shopId: 2, placedAt: '2026-04-01T10:00:00' }));
      await r.orders.create(order({ customerName: 'Other account', accountId: 2, placedAt: '2026-04-02T10:00:00' }));
      const names = async (filters) => (await r.orders.list({ accountId: 1, offset: 0, limit: 10, ...filters })).rows.map((o) => o.customerName);
      assert.deepEqual(await names({}), ['Other shop', 'Anita', 'Sarah Jenkins', 'Michael Chen']);
      assert.deepEqual(await names({ shopId: 1 }), ['Anita', 'Sarah Jenkins', 'Michael Chen']);
      assert.deepEqual(await names({ from: '2026-03-21', to: '2026-03-21' }), ['Sarah Jenkins', 'Michael Chen']);
      assert.deepEqual(await names({ from: '2026-03-22' }), ['Other shop', 'Anita']);
      assert.deepEqual(await names({ to: '2026-03-21' }), ['Sarah Jenkins', 'Michael Chen']);
      assert.deepEqual(await names({ search: 'ICED latte' }), ['Sarah Jenkins']);
      assert.deepEqual(await names({ search: 'preparing' }), ['Michael Chen']);
      assert.deepEqual(await names({ search: '7:10 PM' }), ['Anita']);
      assert.deepEqual(await names({ search: 'nothing like this' }), []);
      const page = await r.orders.list({ accountId: 1, offset: 2, limit: 1 });
      assert.deepEqual([page.total, page.rows.map((o) => o.customerName)], [4, ['Sarah Jenkins']]);
      const searchedPage = await r.orders.list({ accountId: 1, search: 'a', offset: 1, limit: 1 });
      assert.equal(searchedPage.rows.length, 1);
      assert.ok(searchedPage.total >= 2);
    });

    test('orders: equal times are ordered by id, newest id first; findAll ignores paging; recent is limited to one shop', async () => {
      const a = await r.orders.create(order({ placedAt: '2026-03-21T10:00:00' }));
      const b = await r.orders.create(order({ placedAt: '2026-03-21T10:00:00' }));
      await r.orders.create(order({ shopId: 2, placedAt: '2026-03-21T11:00:00' }));
      assert.deepEqual((await r.orders.findAll({ accountId: 1, shopId: 1 })).map((o) => o.id), [b.id, a.id]);
      assert.deepEqual((await r.orders.recent({ accountId: 1, shopId: 1, limit: 1 })).map((o) => o.id), [b.id]);
      assert.equal((await r.orders.findAll({ accountId: 1 })).length, 3);
    });

    test('orders: transition is guarded by the current status; pay writes the payment and the status together or not at all', async () => {
      const created = await r.orders.create(order());
      const scope = { accountId: 1 };
      assert.equal(await r.orders.transition(created.id, { accountId: 2 }, { from: 'Pending', to: 'Preparing' }), null, 'another account');
      assert.equal(await r.orders.transition(created.id, scope, { from: 'Preparing', to: 'Delivered' }), null, 'wrong current status');
      assert.equal((await r.orders.transition(created.id, scope, { from: 'Pending', to: 'Preparing' })).status, 'Preparing');
      assert.equal((await r.orders.transition(created.id, scope, { from: 'Preparing', to: 'Delivered' })).status, 'Delivered');

      const payment = { method: 'Card', amount: 100, paidAt: '2026-03-21T12:30:00', recordedBy: 7 };
      assert.equal(await r.orders.pay(created.id, { accountId: 2 }, { from: 'Delivered', to: 'Paid', payment }), null, 'another account');
      assert.equal(await r.orders.pay(created.id, scope, { from: 'Pending', to: 'Paid', payment }), null, 'wrong current status');
      assert.equal((await r.orders.findById(created.id, scope)).payment, null, 'a refused payment leaves no row');
      const paid = await r.orders.pay(created.id, scope, { from: 'Delivered', to: 'Paid', payment });
      assert.deepEqual([paid.status, paid.payment], ['Paid', payment]);
      assert.deepEqual((await r.orders.findById(created.id, scope)).payment, payment, 'findById and list return the payment too');
      assert.deepEqual((await r.orders.list({ accountId: 1, offset: 0, limit: 5 })).rows[0].payment, payment);
      assert.equal(await r.orders.pay(created.id, scope, { from: 'Paid', to: 'Paid', payment }), null, 'a second payment is refused');
      assert.equal(await r.orders.update(created.id, scope, { type: 'Take Away', subtotal: 1, discountTotal: 0, total: 1, items: [item('X', 1, 1)] }) !== null, true);
      assert.deepEqual((await r.orders.findById(created.id, scope)).payment, payment, 'editing lines never touches the payment');
    });

    test('orders: countNewCustomers counts customers whose first order falls in the range (none today: nothing sets customerId)', async () => {
      await r.orders.create(order());
      assert.equal(await r.orders.countNewCustomers({ accountId: 1 }), 0);
    });

    test('discount applications: create, find, list newest first with search, account scoping', async () => {
      const a = await r.apps.create(application());
      assert.deepEqual(
        [a.discountName, a.discountPercentage, a.startDate, a.endDate, a.status, a.appliesToAll, a.productIds, typeof a.createdAt],
        ['Seasonal', 7.5, '2026-03-01', '2026-03-31', 'Active', false, [4, 9], 'string'],
      );
      const b = await r.apps.create(application({ discountName: 'Weekend', discountPercentage: 12, appliesToAll: true, productIds: [], status: 'Inactive' }));
      assert.deepEqual(await r.apps.findById(a.id, { accountId: 1 }), a);
      assert.equal(await r.apps.findById(a.id, { accountId: 2 }), null);
      const list = await r.apps.list({ accountId: 1, offset: 0, limit: 10 });
      assert.deepEqual([list.total, list.rows.map((x) => x.id)], [2, [b.id, a.id]]);
      const names = async (search) => (await r.apps.list({ accountId: 1, search, offset: 0, limit: 10 })).rows.map((x) => x.discountName);
      assert.deepEqual(await names('weekend'), ['Weekend']);
      assert.deepEqual(await names('inactive'), ['Weekend']);
      assert.deepEqual(await names('7.5'), ['Seasonal']);
      assert.deepEqual(await names('2 products'), ['Seasonal']);
      assert.deepEqual(await names('all products'), ['Weekend']);
      assert.deepEqual((await r.apps.list({ accountId: 2, offset: 0, limit: 10 })).rows, []);
    });

    test('discount applications: update replaces everything incl. products; setStatus; remove; other accounts get null/false', async () => {
      const a = await r.apps.create(application());
      const updated = await r.apps.update(a.id, { accountId: 1 }, application({ discountId: 5, discountName: 'New', discountPercentage: 20, appliesToAll: true, productIds: [], status: 'Inactive' }));
      assert.deepEqual([updated.discountId, updated.discountName, updated.discountPercentage, updated.appliesToAll, updated.productIds, updated.status], [5, 'New', 20, true, [], 'Inactive']);
      assert.deepEqual((await r.apps.setStatus(a.id, { accountId: 1 }, 'Active')).status, 'Active');
      assert.equal(await r.apps.update(a.id, { accountId: 2 }, application()), null);
      assert.equal(await r.apps.setStatus(a.id, { accountId: 2 }, 'Inactive'), null);
      assert.equal(await r.apps.setStatus(a.id + 999, { accountId: 1 }, 'Inactive'), null);
      assert.equal(await r.apps.remove(a.id, { accountId: 2 }), false);
      assert.equal(await r.apps.remove(a.id, { accountId: 1 }), true);
      assert.equal(await r.apps.remove(a.id, { accountId: 1 }), false);
      assert.equal(await r.apps.findById(a.id, { accountId: 1 }), null);
    });

    test('discount applications: findActiveOn returns only Active ones of the account whose period includes the date (both ends inclusive)', async () => {
      const inside = await r.apps.create(application({ startDate: '2026-03-10', endDate: '2026-03-20' }));
      await r.apps.create(application({ startDate: '2026-03-10', endDate: '2026-03-20', status: 'Inactive' }));
      await r.apps.create(application({ startDate: '2026-03-21', endDate: '2026-03-30' }));
      await r.apps.create(application({ startDate: '2026-03-10', endDate: '2026-03-20', accountId: 2 }));
      const ids = async (date) => (await r.apps.findActiveOn({ accountId: 1, date })).map((a) => a.id);
      assert.deepEqual(await ids('2026-03-10'), [inside.id]);
      assert.deepEqual(await ids('2026-03-20'), [inside.id]);
      assert.deepEqual(await ids('2026-03-09'), []);
      assert.equal((await ids('2026-03-21')).length, 1);
    });
  });
}

if (!db) {
  test('Sales repositories on MySQL', { skip: 'SALES_TEST_DATABASE_URL is not set: the Prisma repositories were NOT tested' }, () => {});
}
