// The Menu repository contract (products, categories, ingredients, discount definitions), run against the in-memory driver
// ALWAYS and against MySQL (Prisma) when MENU_TEST_DATABASE_URL points at a database whose name ends in _test (its tables
// are emptied). Both drivers must behave the same, because the service cannot tell them apart.
const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { testDatabase } = require('@pos-cafe/shared/testing/database');

const db = testDatabase('MENU_TEST_DATABASE_URL');
const drivers = [{
  name: 'memory',
  load: () => ({
    repos: {
      menu: require('../../repositories/memory/menuRepository'),
      category: require('../../repositories/memory/categoryRepository'),
      ingredient: require('../../repositories/memory/ingredientRepository'),
      discount: require('../../repositories/memory/discountRepository'),
    },
    reset: require('../../repositories/memory/store').reset,
  }),
}];
if (db) {
  drivers.push({
    name: 'prisma (MySQL test database)',
    load: () => {
      process.env.REPOSITORY_DRIVER = 'prisma';
      process.env.MENU_DATABASE_URL = db.url;
      const { prisma } = require('../../repositories/prisma/client');
      return {
        repos: {
          menu: require('../../repositories/prisma/menuRepository'),
          category: require('../../repositories/prisma/categoryRepository'),
          ingredient: require('../../repositories/prisma/ingredientRepository'),
          discount: require('../../repositories/prisma/discountRepository'),
        },
        reset: async () => {
          await prisma.productIngredient.deleteMany();
          await prisma.product.deleteMany();
          await prisma.ingredient.deleteMany();
          await prisma.discount.deleteMany();
          await prisma.category.deleteMany();
        },
        close: () => prisma.$disconnect(),
      };
    },
  });
}

const product = (categoryId, over = {}) => ({ name: 'Ice Coffee', categoryId, costPrice: 350, sellingPrice: 500, quantity: 112, lowStockAlert: 15, discountId: null, ...over });

for (const driver of drivers) {
  describe(`Menu repositories: ${driver.name}`, () => {
    let r; let reset; let close;
    before(() => { ({ repos: r, reset, close } = driver.load()); });
    after(async () => { await reset(); if (close) await close(); });
    beforeEach(async () => { await reset(); });

    test('categories: create, list in creation order, find by id and by name (ignoring case), count', async () => {
      const a = await r.category.create('Coffee');
      const b = await r.category.create('Drinks');
      assert.deepEqual([a.name, typeof a.createdAt, (await r.category.list()).map((c) => c.name)], ['Coffee', 'string', ['Coffee', 'Drinks']]);
      assert.equal((await r.category.findById(b.id)).name, 'Drinks');
      assert.equal(await r.category.findById(b.id + 999), null);
      assert.equal((await r.category.findByName('cOFFEE')).id, a.id);
      assert.equal(await r.category.findByName('Nope'), null);
      assert.equal(await r.category.count(), 2);
    });

    test('discount definitions: percentage is a plain number, names are found ignoring case', async () => {
      const d = await r.discount.create({ name: 'Seasonal Discount', percentage: 7.5 });
      assert.deepEqual([d.name, d.percentage, typeof d.percentage], ['Seasonal Discount', 7.5, 'number']);
      await r.discount.create({ name: 'Zero', percentage: 0 });
      assert.deepEqual((await r.discount.list()).map((x) => [x.name, x.percentage]), [['Seasonal Discount', 7.5], ['Zero', 0]]);
      assert.equal((await r.discount.findByName('seasonal DISCOUNT')).id, d.id);
      assert.equal((await r.discount.findById(d.id)).percentage, 7.5);
      assert.equal(await r.discount.findById(d.id + 999), null);
    });

    test('ingredients: create, case-insensitive search, find-or-create returns the same row', async () => {
      const milk = await r.ingredient.create('Milk');
      await r.ingredient.create('Coffee Powder');
      assert.deepEqual((await r.ingredient.search('')).map((i) => i.name), ['Milk', 'Coffee Powder']);
      assert.deepEqual((await r.ingredient.search('MIL')).map((i) => i.name), ['Milk']);
      assert.deepEqual(await r.ingredient.search('zzz'), []);
      assert.equal((await r.ingredient.findOrCreateByName('milk')).id, milk.id, 'ignores case');
      const sugar = await r.ingredient.findOrCreateByName('Sugar');
      assert.equal((await r.ingredient.findOrCreateByName('Sugar')).id, sugar.id);
      assert.equal((await r.ingredient.findByName('SUGAR')).name, 'Sugar');
      assert.equal((await r.ingredient.search('')).length, 3);
    });

    test('products: findByIds returns only existing products with joins; stockOverview counts and orders the ones needing attention', async () => {
      const cat = await r.category.create('Coffee');
      const disc = await r.discount.create({ name: 'Ten', percentage: 10 });
      const ok = await r.menu.create(product(cat.id, { name: 'Ok', quantity: 50, lowStockAlert: 10, discountId: disc.id }), []);
      const low = await r.menu.create(product(cat.id, { name: 'Low', quantity: 3, lowStockAlert: 10 }), []);
      const out = await r.menu.create(product(cat.id, { name: 'Out', quantity: 0, lowStockAlert: 10 }), []);
      const found = await r.menu.findByIds([ok.id, out.id + 999]);
      assert.deepEqual(found.map((p) => [p.id, p.name, p.sellingPrice, p.categoryName, p.discountName]), [[ok.id, 'Ok', 500, 'Coffee', 'Ten']]);
      assert.deepEqual(await r.menu.findByIds([]), []);
      const overview = await r.menu.stockOverview({ limit: 5 });
      assert.deepEqual(overview.counts, { outOfStock: 1, lowStock: 1, inStock: 1 });
      assert.deepEqual(overview.attention.map((p) => p.name), ['Out', 'Low']);
      assert.deepEqual((await r.menu.stockOverview({ limit: 1 })).attention.map((p) => p.id), [out.id]);
      assert.ok(low.id);
    });

    test('products: create, then findById returns joins and the ingredient list in the saved order', async () => {
      const cat = await r.category.create('Coffee');
      const disc = await r.discount.create({ name: 'Ten', percentage: 10 });
      const milk = await r.ingredient.create('Milk');
      const sugar = await r.ingredient.create('Sugar');
      const created = await r.menu.create(product(cat.id, { discountId: disc.id }), [{ ingredientId: sugar.id, quantity: '5 g' }, { ingredientId: milk.id, quantity: '50 ml' }]);
      assert.deepEqual([created.name, created.sellingPrice, created.costPrice, created.quantity, created.imagePath, typeof created.createdAt], ['Ice Coffee', 500, 350, 112, null, 'string']);
      const found = await r.menu.findById(created.id);
      assert.deepEqual([found.categoryName, found.discountName, found.discountPercentage, found.discountId], ['Coffee', 'Ten', 10, disc.id]);
      assert.deepEqual(found.ingredients, [{ ingredientId: sugar.id, name: 'Sugar', quantity: '5 g' }, { ingredientId: milk.id, name: 'Milk', quantity: '50 ml' }]);
      assert.equal(await r.menu.findById(created.id + 999), null);
    });

    test('products: optional fields stay null, and the largest values the validation allows round-trip exactly', async () => {
      const cat = await r.category.create('Coffee');
      const plain = await r.menu.create(product(cat.id, { costPrice: null, lowStockAlert: null, discountId: null }), []);
      const row = await r.menu.findById(plain.id);
      assert.deepEqual([row.costPrice, row.lowStockAlert, row.discountId, row.discountName, row.discountPercentage, row.ingredients], [null, null, null, null, null, []]);
      const big = await r.menu.create(product(cat.id, { name: 'Ünïcødé ☕ 日本語', sellingPrice: 99999999.99, costPrice: 0.01, quantity: Number.MAX_SAFE_INTEGER, lowStockAlert: 9007199254740000 }), []);
      const back = await r.menu.findById(big.id);
      assert.deepEqual([back.name, back.sellingPrice, back.costPrice, back.quantity, back.lowStockAlert], ['Ünïcødé ☕ 日本語', 99999999.99, 0.01, Number.MAX_SAFE_INTEGER, 9007199254740000]);
    });

    test('products list: newest first, price sorts, category filter, status filter, search by name, #code, category and status, paging', async () => {
      const coffee = await r.category.create('Coffee');
      const tea = await r.category.create('Tea');
      const a = await r.menu.create(product(coffee.id, { name: 'Alpha', sellingPrice: 300, quantity: 50, lowStockAlert: 10 }), []);
      const b = await r.menu.create(product(tea.id, { name: 'Beta', sellingPrice: 100, quantity: 5, lowStockAlert: 10 }), []);
      const c = await r.menu.create(product(coffee.id, { name: 'Gamma', sellingPrice: 200, quantity: 0, lowStockAlert: null }), []);
      const names = async (q) => (await r.menu.list({ offset: 0, limit: 50, ...q })).rows.map((x) => x.name);
      assert.deepEqual(await names({}), ['Gamma', 'Beta', 'Alpha']);
      assert.deepEqual(await names({ sort: 'price_asc' }), ['Beta', 'Gamma', 'Alpha']);
      assert.deepEqual(await names({ sort: 'price_desc' }), ['Alpha', 'Gamma', 'Beta']);
      assert.deepEqual(await names({ categoryId: coffee.id }), ['Gamma', 'Alpha']);
      assert.deepEqual(await names({ status: 'Low Stock' }), ['Beta']);
      assert.deepEqual(await names({ status: 'Out of stock' }), ['Gamma']);
      assert.deepEqual(await names({ search: 'ALP' }), ['Alpha']);
      assert.deepEqual(await names({ search: `#PRD${b.id}` }), ['Beta']);
      assert.deepEqual(await names({ search: 'tea' }), ['Beta']);
      assert.deepEqual(await names({ search: 'low stock' }), ['Beta']);
      const page = await r.menu.list({ offset: 1, limit: 1 });
      assert.deepEqual([page.total, page.rows.map((x) => x.name), page.rows[0].categoryName], [3, ['Beta'], 'Tea']);
      assert.ok(a.id < b.id && b.id < c.id);
    });

    test('products: update replaces the columns and the whole ingredient list; null for an unknown id', async () => {
      const cat = await r.category.create('Coffee');
      const cat2 = await r.category.create('Tea');
      const milk = await r.ingredient.create('Milk');
      const sugar = await r.ingredient.create('Sugar');
      const p = await r.menu.create(product(cat.id), [{ ingredientId: milk.id, quantity: '50 ml' }]);
      const updated = await r.menu.update(p.id, product(cat2.id, { name: 'Renamed', sellingPrice: 750.5, quantity: 3, costPrice: null }), [{ ingredientId: sugar.id, quantity: '1 g' }]);
      assert.deepEqual([updated.name, updated.categoryId, updated.sellingPrice, updated.quantity, updated.costPrice, updated.createdAt], ['Renamed', cat2.id, 750.5, 3, null, p.createdAt]);
      assert.ok(updated.updatedAt >= p.updatedAt);
      assert.deepEqual((await r.menu.findById(p.id)).ingredients.map((i) => i.name), ['Sugar']);
      assert.equal(await r.menu.update(p.id + 999, product(cat.id), []), null);
    });

    test('products: remove returns the row and deletes only the product and its links, never an ingredient', async () => {
      const cat = await r.category.create('Coffee');
      const milk = await r.ingredient.create('Milk');
      const p = await r.menu.create(product(cat.id), [{ ingredientId: milk.id, quantity: '50 ml' }]);
      const removed = await r.menu.remove(p.id);
      assert.equal(removed.id, p.id);
      assert.equal(await r.menu.findById(p.id), null);
      assert.equal(await r.menu.remove(p.id), null);
      assert.equal((await r.ingredient.findById(milk.id)).name, 'Milk', 'the ingredient stays');
      assert.equal((await r.category.findById(cat.id)).name, 'Coffee');
    });

    test('ingredient quantity update, image path, and the summary counts', async () => {
      const cat = await r.category.create('Coffee');
      const milk = await r.ingredient.create('Milk');
      const other = await r.ingredient.create('Sugar');
      const p = await r.menu.create(product(cat.id), [{ ingredientId: milk.id, quantity: '50 ml' }]);
      assert.equal(await r.menu.updateIngredientQuantity(p.id, milk.id, '55 ml'), true);
      assert.equal((await r.menu.findById(p.id)).ingredients[0].quantity, '55 ml');
      assert.equal(await r.menu.updateIngredientQuantity(p.id, other.id, '1 g'), false, 'not linked to this product');
      assert.equal(await r.menu.updateIngredientQuantity(p.id + 999, milk.id, '1 g'), false);

      assert.equal(await r.menu.setImagePath(p.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'), null);
      assert.equal(await r.menu.setImagePath(p.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg'), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png');
      assert.equal((await r.menu.findById(p.id)).imagePath, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg');
      assert.equal(await r.menu.setImagePath(p.id + 999, 'cccccccc-cccc-cccc-cccc-cccccccccccc.png'), undefined);

      await r.menu.create(product(cat.id, { name: 'Gone', quantity: 0 }), []);
      assert.deepEqual(await r.menu.counts(), { total: 2, active: 1, outOfStock: 1 });
    });
  });
}

if (!db) test('MySQL repository tests', { skip: 'MENU_TEST_DATABASE_URL is not set (database name must end in _test); only the memory driver was tested' }, () => {});
