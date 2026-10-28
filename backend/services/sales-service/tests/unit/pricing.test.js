// Money arithmetic and order pricing: pure functions, no server. Totals are whole cents, never floating-point sums.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toCents, fromCents, toDecimalString, percentOf } = require('../../utils/money');
const { priceOrder } = require('../../services/order/pricing');

test('money: cents conversion is exact for 2-decimal amounts and the decimal text is zero padded', () => {
  assert.equal(toCents(250.5), 25050);
  assert.equal(toCents('0.07'), 7);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(1.01), 101);
  assert.equal(fromCents(25050), 250.5);
  assert.equal(toDecimalString(5), '0.05');
  assert.equal(toDecimalString(123456), '1234.56');
  assert.equal(toDecimalString(0), '0.00');
});

test('money: a percentage of an amount is rounded half up to the cent, in integers', () => {
  assert.equal(percentOf(1000, 10), 100);
  assert.equal(percentOf(999, 10), 100); // 99.9 -> 100
  assert.equal(percentOf(105, 10), 11); // 10.5 -> 11 (half up)
  assert.equal(percentOf(104, 10), 10); // 10.4 -> 10
  assert.equal(percentOf(1000, 7.5), 75);
  assert.equal(percentOf(1000, 0), 0);
  assert.equal(percentOf(1000, 100), 1000);
  assert.equal(percentOf(333, 33.33), 111); // 110.9889 -> 111
});

test('floating-point trap: 0.1 + 0.2 stays exactly 0.3 because lines are added as cents', () => {
  const p = new Map([[1, { name: 'A', sellingPrice: 0.1 }], [2, { name: 'B', sellingPrice: 0.2 }]]);
  const r = priceOrder([{ productId: 1, quantity: 1 }, { productId: 2, quantity: 1 }], p, []);
  assert.equal(r.subtotal, 0.3);
  assert.equal(r.total, 0.3);
  assert.notEqual(0.1 + 0.2, 0.3, 'plain float arithmetic would not be exact');
});

const products = new Map([[1, { name: 'Latte', sellingPrice: 250 }], [2, { name: 'Muffin', sellingPrice: 180.5 }], [3, { name: 'Tea', sellingPrice: 100 }]]);
const app = (id, pct, over = {}) => ({ id, discountPercentage: pct, appliesToAll: false, productIds: [], ...over });

test('pricing: no discounts means total = subtotal = sum of quantity x unit price; the lines keep a copy of name and price', () => {
  const r = priceOrder([{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }], products, []);
  assert.equal(r.subtotal, 680.5);
  assert.equal(r.discountTotal, 0);
  assert.equal(r.total, 680.5);
  assert.deepEqual(r.items[0], { productId: 1, name: 'Latte', unitPrice: 250, quantity: 2, discountPercentage: 0, discountAmount: 0, discountApplicationId: null });
});

test('pricing: an application discounts only the products it lists; "all products" applications discount every line', () => {
  const r = priceOrder([{ productId: 1, quantity: 2 }, { productId: 3, quantity: 1 }], products, [app(7, 10, { productIds: [1] })]);
  assert.deepEqual(r.items.map((i) => [i.discountPercentage, i.discountAmount, i.discountApplicationId]), [[10, 50, 7], [0, 0, null]]);
  assert.deepEqual([r.subtotal, r.discountTotal, r.total], [600, 50, 550]);
  const all = priceOrder([{ productId: 1, quantity: 1 }, { productId: 3, quantity: 1 }], products, [app(8, 20, { appliesToAll: true })]);
  assert.deepEqual([all.subtotal, all.discountTotal, all.total], [350, 70, 280]);
});

test('pricing: several eligible applications are NOT stacked: the largest percentage wins, the lowest id wins a tie', () => {
  const r = priceOrder([{ productId: 1, quantity: 1 }], products, [app(1, 10, { appliesToAll: true }), app(2, 25, { productIds: [1] }), app(3, 25, { appliesToAll: true })]);
  assert.deepEqual([r.items[0].discountPercentage, r.items[0].discountApplicationId, r.discountTotal, r.total], [25, 2, 62.5, 187.5]);
});

test('pricing: the discount is rounded half up per line, in cents', () => {
  const p = new Map([[1, { name: 'X', sellingPrice: 0.35 }]]);
  const r = priceOrder([{ productId: 1, quantity: 3 }], p, [app(1, 10, { appliesToAll: true })]); // 105 cents -> 10.5 -> 11
  assert.deepEqual([r.subtotal, r.discountTotal, r.total], [1.05, 0.11, 0.94]);
});
