// The Auth repository contract (users, accounts, sessions, one-time codes, signup registrations), run against the in-memory
// driver ALWAYS and against MySQL (Prisma) when AUTH_TEST_DATABASE_URL points at a database whose name ends in _test (its
// tables are emptied). Both drivers must behave the same, because the services cannot tell them apart.
const { describe, test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { testDatabase } = require('@pos-cafe/shared/testing/database');

const db = testDatabase('AUTH_TEST_DATABASE_URL');
const names = ['adminProfile', 'account', 'session', 'otp', 'registration'];
const load = (driver) => Object.fromEntries(names.map((n) => [n, require(`../../repositories/${driver}/${n}Repository`)]));

const drivers = [{ name: 'memory', load: () => ({ r: load('memory'), reset: require('../../repositories/memory/store').reset }) }];
if (db) {
  drivers.push({
    name: 'prisma (MySQL test database)',
    load: () => {
      process.env.REPOSITORY_DRIVER = 'prisma';
      process.env.AUTH_DATABASE_URL = db.url;
      const { prisma } = require('../../repositories/prisma/client');
      return {
        r: load('prisma'),
        prisma,
        reset: async () => {
          await prisma.oneTimeCode.deleteMany();
          await prisma.registration.deleteMany();
          await prisma.session.deleteMany();
          await prisma.user.deleteMany();
          await prisma.account.deleteMany();
        },
        close: () => prisma.$disconnect(),
      };
    },
  });
}

const owner = (over = {}) => ({
  firstName: 'Olivia', lastName: 'Owner', username: 'olivia', phone: '+94 71 234 5678', phoneNormalized: '+94712345678', email: 'Owner@PosCafe.com',
  passwordHash: 'scrypt$65536$8$2$c2FsdA==$aGFzaA==', role: 'owner', status: 'active', emailVerifiedAt: 1_700_000_000_000, phoneVerifiedAt: 1_700_000_100_000, ...over,
});

for (const driver of drivers) {
  describe(`Auth repositories: ${driver.name}`, () => {
    let r; let reset; let close; let prisma;
    before(() => { ({ r, reset, close, prisma } = driver.load()); });
    after(async () => { await reset(); if (close) await close(); });
    beforeEach(async () => { await reset(); });

    test('accounts: the owner is created with the account, ids are fresh, and removeOwner rolls it back', async () => {
      const a = await r.account.createWithOwner({ owner: owner() });
      const b = await r.account.createWithOwner({ owner: owner({ email: 'other@x.com', phoneNormalized: '+94770000000' }) });
      assert.notEqual(a.accountId, b.accountId);
      assert.deepEqual([a.owner.accountId, a.owner.role, a.owner.status, a.owner.email, a.owner.username, a.owner.imagePath], [a.accountId, 'owner', 'active', 'Owner@PosCafe.com', 'olivia', null]);
      assert.deepEqual([a.owner.emailVerifiedAt, a.owner.phoneVerifiedAt], [1_700_000_000_000, 1_700_000_100_000], 'epoch-ms times round-trip as numbers');
      assert.match(a.owner.createdAt, /^\d{4}-\d{2}-\d{2}T/);
      await r.account.removeOwner(a.owner.id);
      assert.equal(await r.adminProfile.findById(a.owner.id), null);
      assert.equal((await r.adminProfile.findById(b.owner.id)).email, 'other@x.com', 'another account is untouched');
      await r.account.removeOwner(a.owner.id + 999); // an unknown owner is not an error
    });

    test('users: find by id, email (ignoring case) and normalized phone; unknown values give null', async () => {
      const { owner: o } = await r.account.createWithOwner({ owner: owner() });
      assert.equal((await r.adminProfile.findById(o.id)).firstName, 'Olivia');
      assert.equal((await r.adminProfile.findByEmail('OWNER@poscafe.COM')).id, o.id);
      assert.equal((await r.adminProfile.findByPhone('+94712345678')).id, o.id);
      assert.equal(await r.adminProfile.findByEmail('nobody@x.com'), null);
      assert.equal(await r.adminProfile.findByPhone('0000'), null);
      assert.equal(await r.adminProfile.findById(o.id + 999), null);
    });

    test('users: admins are listed per account, newest first, and an account never sees another account', async () => {
      const a = await r.account.createWithOwner({ owner: owner() });
      const b = await r.account.createWithOwner({ owner: owner({ email: 'b@x.com', phoneNormalized: '+94770000001' }) });
      const admin = (n, accountId) => r.adminProfile.create({ accountId, role: 'admin', status: 'active', firstName: n, lastName: 'Admin', phone: '1', phoneNormalized: '1', email: `${n}@x.com`, passwordHash: 'h', emailVerifiedAt: null, phoneVerifiedAt: null });
      await admin('first', a.accountId);
      await admin('second', a.accountId);
      await admin('elsewhere', b.accountId);
      assert.deepEqual((await r.adminProfile.listByAccount(a.accountId)).map((u) => u.firstName), ['second', 'first', 'Olivia']);
      assert.deepEqual((await r.adminProfile.listByAccount(b.accountId)).map((u) => u.firstName), ['elsewhere', 'Olivia']);
      assert.deepEqual(await r.adminProfile.listByAccount(a.accountId + 9999), []);
    });

    test('users: update changes only the profile fields; password, touchLogin, image and remove work; unknown ids are safe', async () => {
      const { owner: o } = await r.account.createWithOwner({ owner: owner() });
      const u = await r.adminProfile.update(o.id, { firstName: 'Olive', lastName: 'Oak', phone: '0711111111', email: 'new@x.com', phoneNormalized: '0711111111', role: 'admin', status: 'disabled', passwordHash: 'x', accountId: 999 });
      assert.deepEqual([u.firstName, u.email, u.role, u.status, u.passwordHash, u.accountId], ['Olive', 'new@x.com', 'owner', 'active', owner().passwordHash, o.accountId], 'role, status, password and account are never set by update');
      assert.ok(u.updatedAt >= o.updatedAt);
      assert.equal(await r.adminProfile.update(o.id + 999, { firstName: 'x' }), null);

      assert.equal(await r.adminProfile.setPasswordHash(o.id, 'newhash'), true);
      assert.equal((await r.adminProfile.findById(o.id)).passwordHash, 'newhash');
      assert.equal(await r.adminProfile.setPasswordHash(o.id + 999, 'x'), false);
      await r.adminProfile.touchLogin(o.id, 1_800_000_000_000);
      assert.equal((await r.adminProfile.findById(o.id)).lastLoginAt, 1_800_000_000_000);
      assert.equal(await r.adminProfile.setImagePath(o.id, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png'), null);
      assert.equal(await r.adminProfile.setImagePath(o.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.png'), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png');
      assert.equal(await r.adminProfile.setImagePath(o.id + 999, 'cccccccc-cccc-cccc-cccc-cccccccccccc.png'), undefined);
      await r.account.removeOwner(o.id);
      await r.adminProfile.remove(o.id + 999);
    });

    test('users: text round-trips unchanged, including non-English names and the longest allowed values', async () => {
      const a = await r.account.createWithOwner({ owner: owner({ firstName: 'கார்த்திக்', lastName: 'Ñandú 日本語 🙂', username: 'u'.repeat(50), email: `${'e'.repeat(240)}@x.com`, phone: `+94 ${'7'.repeat(100)}` }) });
      const back = await r.adminProfile.findById(a.owner.id);
      assert.deepEqual([back.firstName, back.lastName, back.username.length, back.email.length, back.phone.length], ['கார்த்திக்', 'Ñandú 日本語 🙂', 50, 246, 104]);
    });

    test('sessions: create, find, revoke once, and revokeAllForUser keeps the excepted one', async () => {
      const { owner: o } = await r.account.createWithOwner({ owner: owner() });
      const other = await r.adminProfile.create({ accountId: o.accountId, role: 'admin', status: 'active', firstName: 'A', lastName: 'B', phone: '1', phoneNormalized: '1', email: 'a@x.com', passwordHash: 'h' });
      const mk = (userId) => r.session.create({ userId, accountId: o.accountId, createdAt: 1000, expiresAt: 9_000_000_000_000 });
      const s1 = await mk(o.id); const s2 = await mk(o.id); const s3 = await mk(o.id); const sOther = await mk(other.id);
      assert.match(s1.sid, /^[0-9a-f-]{36}$/);
      assert.deepEqual([s1.userId, s1.accountId, s1.createdAt, s1.expiresAt, s1.revokedAt], [o.id, o.accountId, 1000, 9_000_000_000_000, null]);
      assert.deepEqual(await r.session.find(s1.sid), s1);
      assert.equal(await r.session.find('00000000-0000-0000-0000-000000000000'), null);

      await r.session.revoke(s1.sid, 5000);
      await r.session.revoke(s1.sid, 9999); // a second revoke does not move the time
      assert.equal((await r.session.find(s1.sid)).revokedAt, 5000);
      assert.equal(await r.session.revokeAllForUser(o.id, 6000, s2.sid), 1, 'only s3 was still active and not excepted');
      assert.equal((await r.session.find(s2.sid)).revokedAt, null, 'the excepted session stays');
      assert.equal((await r.session.find(s3.sid)).revokedAt, 6000);
      assert.equal((await r.session.find(sOther.sid)).revokedAt, null, "another user's session is untouched");
      assert.equal(await r.session.revokeAllForUser(o.id, 7000), 1);
    });

    test('one-time codes: history in order, newest active, find by hash, update, invalidate', async () => {
      const mk = (over = {}) => r.otp.create({ purpose: 'signup_email', subject: '1', hash: `h${Math.random()}`.slice(0, 20), expiresAt: 2_000_000_000_000, createdAt: 1000, ...over });
      const a = await mk({ hash: 'hash-a' }); const b = await mk({ hash: 'hash-b' });
      await mk({ subject: '2', hash: 'hash-other' });
      assert.deepEqual([a.attempts, a.usedAt, a.invalidatedAt, a.expiresAt], [0, null, null, 2_000_000_000_000]);
      assert.deepEqual((await r.otp.history('signup_email', '1')).map((x) => x.hash), ['hash-a', 'hash-b']);
      assert.equal((await r.otp.latestActive('signup_email', '1')).id, b.id);
      assert.equal((await r.otp.findActiveByHash('signup_email', 'hash-a')).id, a.id);
      assert.equal(await r.otp.findActiveByHash('signup_phone', 'hash-a'), null, 'purpose must match');

      const updated = await r.otp.update(b.id, { attempts: 3, usedAt: 4000, purpose: 'ignored', hash: 'ignored' });
      assert.deepEqual([updated.attempts, updated.usedAt, updated.purpose, updated.hash], [3, 4000, 'signup_email', 'hash-b'], 'only attempts, usedAt and invalidatedAt can change');
      assert.equal((await r.otp.latestActive('signup_email', '1')).id, a.id, 'a used code is no longer active');
      assert.equal(await r.otp.update(b.id + 999, { attempts: 1 }), null);
      await r.otp.invalidateActive('signup_email', '1', 5000);
      assert.equal(await r.otp.latestActive('signup_email', '1'), null);
      assert.equal((await r.otp.history('signup_email', '1'))[0].invalidatedAt, 5000);
      assert.ok(await r.otp.latestActive('signup_email', '2'), 'another subject is untouched');
    });

    test('registrations: the signup steps fill the row, the secrets are wiped at activation, open ones are found ignoring case', async () => {
      const reg = await r.registration.create({
        tokenHash: 'token-hash-1', tokenExpiresAt: 2_000_000_000_000, email: 'New@PosCafe.com', username: 'newbie', passwordHash: 'pw-hash',
        termsAcceptedAt: 1000, status: 'email_pending', emailVerifiedAt: null, phoneVerifiedAt: null, createdAt: 1000,
      });
      assert.deepEqual([reg.status, reg.accessKeyAttempts ?? 0, reg.ownerName ?? null, reg.accessKeySends ?? null], ['email_pending', 0, null, null]);
      assert.equal((await r.registration.findByTokenHash('token-hash-1')).id, reg.id);
      assert.equal((await r.registration.findById(reg.id)).email, 'New@PosCafe.com');
      assert.equal((await r.registration.findOpenByEmail('new@poscafe.COM')).id, reg.id);
      assert.equal(await r.registration.findByTokenHash('nope'), null);

      await r.registration.update(reg.id, { status: 'phone_pending', ownerName: 'Michel Parede', phone: '+94 71 234 5678', phoneNormalized: '+94712345678', phoneVerifiedAt: null });
      await r.registration.update(reg.id, { status: 'awaiting_activation', businessName: 'POS CAFE', address: 'Jaffna', accessKeyHash: 'key-hash', accessKeyExpiresAt: 3_000_000_000_000, accessKeyAttempts: 0, accessKeySends: [1100, 1200] });
      let row = await r.registration.findById(reg.id);
      assert.deepEqual([row.ownerName, row.businessName, row.accessKeyHash, row.accessKeyExpiresAt, row.accessKeySends], ['Michel Parede', 'POS CAFE', 'key-hash', 3_000_000_000_000, [1100, 1200]]);
      await r.registration.update(reg.id, { accessKeyAttempts: 2 });
      assert.equal((await r.registration.findById(reg.id)).accessKeyAttempts, 2);

      await r.registration.update(reg.id, { status: 'activated', activatedAt: 9000, accessKeyHash: null, passwordHash: null, tokenHash: null });
      row = await r.registration.findById(reg.id);
      assert.deepEqual([row.status, row.activatedAt, row.accessKeyHash, row.passwordHash, row.tokenHash], ['activated', 9000, null, null, null], 'secrets are wiped');
      assert.equal(await r.registration.findOpenByEmail('new@poscafe.com'), null, 'an activated registration is no longer open');
      assert.equal(await r.registration.findByTokenHash('token-hash-1'), null);
      assert.equal(await r.registration.update(reg.id + 999, { status: 'x' }), null);
      await r.registration.remove(reg.id);
      assert.equal(await r.registration.findById(reg.id), null);
      await r.registration.remove(reg.id); // removing twice is not an error
    });
  });
}

if (db) {
  describe('Auth MySQL constraints (the database enforces what the services also check)', () => {
    let r; let prisma; let close; let reset;
    before(() => { ({ r, prisma, close, reset } = drivers[1].load()); });
    after(async () => { await reset(); await close(); });
    beforeEach(async () => { await reset(); });

    test('two users cannot share an email, even with different capitals', async () => {
      await r.account.createWithOwner({ owner: owner({ email: 'same@x.com' }) });
      await assert.rejects(r.account.createWithOwner({ owner: owner({ email: 'SAME@x.com' }) }), (e) => e.code === 'P2002');
      assert.equal(await prisma.user.count(), 1);
      assert.equal(await prisma.account.count(), 1, 'the failed signup left no account row behind (one transaction)');
    });

    test('an admin cannot be added to an account that does not exist', async () => {
      await assert.rejects(r.adminProfile.create({ accountId: 999999, role: 'admin', status: 'active', firstName: 'A', lastName: 'B', phone: '1', phoneNormalized: '1', email: 'a@x.com', passwordHash: 'h' }),
        // Prisma code P2003 for the full-privilege test account; a least-privilege account (SELECT/INSERT/UPDATE/DELETE only) gets MySQL's
        // shorter error 1216, which Prisma does not map. Either way the row is refused by the database; no service code depends on P2003.
        (e) => e.code === 'P2003' || /foreign key constraint fails/i.test(String(e.message)));
    });
  });
} else {
  test('MySQL repository tests', { skip: 'AUTH_TEST_DATABASE_URL is not set (database name must end in _test); only the memory driver was tested' }, () => {});
}
