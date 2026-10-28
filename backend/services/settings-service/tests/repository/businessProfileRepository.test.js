// The shop profile repository contract, run against the in-memory driver ALWAYS and against MySQL (Prisma) when
// SETTINGS_TEST_DATABASE_URL points at a database whose name ends in _test (the table is emptied). Both drivers must
// behave the same, because the service cannot tell them apart.
const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { testDatabase } = require('@pos-cafe/shared/testing/database');

const db = testDatabase('SETTINGS_TEST_DATABASE_URL');
const drivers = [{
  name: 'memory',
  load: () => ({ repo: require('../../repositories/memory/businessProfileRepository'), reset: require('../../repositories/memory/store').reset }),
}];
if (db) {
  drivers.push({
    name: 'prisma (MySQL test database)',
    load: () => {
      process.env.REPOSITORY_DRIVER = 'prisma';
      process.env.SETTINGS_DATABASE_URL = db.url;
      const { prisma } = require('../../repositories/prisma/client');
      return { repo: require('../../repositories/prisma/businessProfileRepository'), reset: () => prisma.shopProfile.deleteMany(), close: () => prisma.$disconnect() };
    },
  });
}

const shop = (over = {}) => ({ accountId: 1, ownerId: 5, name: 'POS CAFE', address: 'Jaffna', phone: '0711234567', email: 'a@b.co', website: 'www.poscafe.com', timezone: '(GMT +05:30) India / Colombo', ...over });

for (const driver of drivers) {
  describe(`ShopProfile repository: ${driver.name}`, () => {
    let repo; let reset; let close;
    before(() => { ({ repo, reset, close } = driver.load()); });
    after(async () => { await reset(); if (close) await close(); });
    beforeEach(async () => { await reset(); });

    test('create returns the stored row with ISO dates and no image', async () => {
      const row = await repo.create(shop());
      assert.ok(Number.isInteger(row.id) && row.id > 0);
      assert.deepEqual([row.accountId, row.ownerId, row.name, row.email, row.timezone, row.imagePath], [1, 5, 'POS CAFE', 'a@b.co', '(GMT +05:30) India / Colombo', null]);
      assert.match(row.createdAt, /^\d{4}-\d{2}-\d{2}T/);
      assert.equal(typeof row.updatedAt, 'string');
      const minimal = await repo.create(shop({ ownerId: null, email: null, website: null, timezone: null }));
      assert.deepEqual([minimal.ownerId, minimal.email, minimal.website, minimal.timezone], [null, null, null, null]);
    });

    test('findById finds a row, and null for an unknown id', async () => {
      const row = await repo.create(shop());
      assert.deepEqual(await repo.findById(row.id), row);
      assert.equal(await repo.findById(row.id + 999), null);
    });

    test('listByAccount is scoped to the account and newest first', async () => {
      const a = await repo.create(shop({ name: 'A' }));
      const b = await repo.create(shop({ name: 'B' }));
      await repo.create(shop({ name: 'Other account', accountId: 2 }));
      assert.deepEqual((await repo.listByAccount(1)).map((r) => r.name), ['B', 'A']);
      assert.deepEqual((await repo.listByAccount(1)).map((r) => r.id), [b.id, a.id]);
      assert.deepEqual((await repo.listByAccount(2)).map((r) => r.name), ['Other account']);
      assert.deepEqual(await repo.listByAccount(99), []);
    });

    test('update replaces the text fields (clearing optional ones), keeps the rest, and returns null for an unknown id', async () => {
      const row = await repo.create(shop());
      await repo.setImagePath(row.id, '11111111-1111-1111-1111-111111111111.png');
      const updated = await repo.update(row.id, { name: 'Renamed', address: 'Colombo', phone: '1', email: null, website: null, timezone: '(GMT +08:00) Singapore', accountId: 77, imagePath: 'x' });
      assert.deepEqual([updated.name, updated.address, updated.email, updated.website, updated.timezone], ['Renamed', 'Colombo', null, null, '(GMT +08:00) Singapore']);
      assert.deepEqual([updated.accountId, updated.ownerId, updated.imagePath], [1, 5, '11111111-1111-1111-1111-111111111111.png'], 'account, owner and image are not touched by update');
      assert.ok(updated.updatedAt >= updated.createdAt);
      assert.equal(await repo.update(row.id + 999, { name: 'x', address: 'x', phone: 'x' }), null);
    });

    test('setImagePath returns the previous file name, and undefined for an unknown id', async () => {
      const row = await repo.create(shop());
      assert.equal(await repo.setImagePath(row.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'), null);
      assert.equal(await repo.setImagePath(row.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg'), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png');
      assert.equal((await repo.findById(row.id)).imagePath, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg');
      assert.equal(await repo.setImagePath(row.id + 999, 'cccccccc-cccc-cccc-cccc-cccccccccccc.png'), undefined);
    });

    test('text round-trips unchanged, including non-English characters and the longest allowed values', async () => {
      const text = { name: 'Café Ñandú ☕ கோப்பி', address: 'ශ්‍රී ලංකාව, 日本語 🙂' };
      const row = await repo.create(shop(text));
      assert.deepEqual([(await repo.findById(row.id)).name, (await repo.findById(row.id)).address], [text.name, text.address]);
      const max = await repo.create(shop({ name: 'n'.repeat(150), address: 'a'.repeat(255), phone: 'p'.repeat(30), email: `${'e'.repeat(240)}@x.com`, website: 'w'.repeat(255) }));
      assert.equal((await repo.findById(max.id)).address.length, 255);
    });
  });
}

if (!db) test('MySQL repository tests', { skip: 'SETTINGS_TEST_DATABASE_URL is not set (database name must end in _test); only the memory driver was tested' }, () => {});
