// Integration tests for the Settings Service (shop profiles, timezones, shop logos, internal endpoints). Real Express app
// on a random 127.0.0.1 port, a stand-in Auth Service for sessions, in-memory repositories, no database, no sample data.
// Adapted from the Settings tests of the old backend; the admin-profile tests moved to the Auth Service with that code.
const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { store } = require('../../repositories/memory/store');
const { uploads, env } = require('../../config');
const { useTestServer } = require('./helpers');

const { ctx, api, tokenFor } = useTestServer();
const S = '/api/v1/settings';
const uploaded = new Set();
const OWNER = { userId: 9000, accountId: 1, role: 'owner' };
const internal = { 'x-internal-key': env.internalKey };

beforeEach(() => { ctx.token = tokenFor(OWNER); });

after(() => {
  for (const f of uploaded) fs.rmSync(path.join(uploads.settingsDir, f), { force: true });
  try { fs.rmdirSync(uploads.settingsDir); } catch { /* not empty or missing: fine */ }
});

const TZ = '(GMT +05:30) India / Colombo';
const shopBody = (over = {}) => ({
  name: 'POS CAFE', address: 'P.O. Box 57, Ramanathan Road, Thirunelvely, Jaffna', phone: '+94 71 23 45 678',
  email: 'michel.admin@poscafe.com', website: 'www.poscafe.com', timezone: TZ, ...over,
});
const fieldsOf = (res) => (res.body.errors || []).map((e) => e.field);
const makeShop = async (over) => { const r = await api('POST', `${S}/shops`, { json: shopBody(over) }); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body.data; };
const as = (token) => ({ headers: { authorization: `Bearer ${token}` } });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF\0'), Buffer.alloc(24, 7), Buffer.from([0xff, 0xd9])]);
const imageForm = (buffer, filename = 'logo.png', field = 'image') => {
  const form = new FormData();
  form.append(field, new Blob([buffer]), filename);
  return form;
};
const listDir = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(png|jpg)$/.test(f)) : []);

// ---------- empty and read-only shape ----------
test('shops start empty, timezones are the five from the design, and nothing can be deleted', async () => {
  assert.deepEqual((await api('GET', `${S}/shops`)).body.data, []);
  assert.deepEqual((await api('GET', `${S}/timezones`)).body.data, [
    '(GMT +00:00) UTC', '(GMT +04:00) Dubai', '(GMT +05:30) India / Colombo', '(GMT +08:00) Singapore', '(GMT +10:00) Australia/Sydney',
  ]);
  const shop = await makeShop();
  assert.equal((await api('DELETE', `${S}/shops/${shop.id}`)).status, 404); // the designs show no delete
  assert.equal((await api('GET', `${S}/shops/${shop.id}`)).status, 200);
  assert.equal((await api('GET', `${S}/admins`)).status, 404, 'admin profiles belong to the Auth Service');
});

// ---------- shop profiles ----------
test('shop profiles: create, list, get and update', async () => {
  const minimal = await api('POST', `${S}/shops`, { json: { name: ' POS  CAFE ', address: 'Jaffna', phone: '0711234567', timezone: TZ } });
  assert.equal(minimal.status, 201);
  assert.deepEqual(
    [minimal.body.data.id, minimal.body.data.name, minimal.body.data.email, minimal.body.data.website, minimal.body.data.image, minimal.body.data.status],
    [1, 'POS CAFE', null, null, null, 'Active'], // email and website are optional; text is trimmed
  );
  const full = await makeShop({ name: 'Second Shop' });
  assert.deepEqual([full.id, full.email, full.website, full.timezone], [2, 'michel.admin@poscafe.com', 'www.poscafe.com', TZ]);

  assert.deepEqual((await api('GET', `${S}/shops`)).body.data.map((s) => s.name), ['Second Shop', 'POS CAFE']);
  assert.deepEqual((await api('GET', `${S}/shops/2`)).body.data, full);

  const updated = await api('PUT', `${S}/shops/1`, { json: shopBody({ name: 'POS CAFE MAIN', timezone: '(GMT +08:00) Singapore', email: undefined, website: undefined }) });
  assert.equal(updated.status, 200);
  assert.deepEqual([updated.body.data.name, updated.body.data.timezone, updated.body.data.address], ['POS CAFE MAIN', '(GMT +08:00) Singapore', shopBody().address]);
  assert.deepEqual([updated.body.data.email, updated.body.data.website], [null, null]); // PUT replaces, so absent optional fields are cleared
  assert.ok(updated.body.data.updatedAt >= updated.body.data.createdAt);
  assert.equal((await api('GET', `${S}/shops/2`)).body.data.name, 'Second Shop'); // other profiles unchanged
});

test('shop profiles: required fields and invalid input', async () => {
  const empty = await api('POST', `${S}/shops`, { json: {} });
  assert.equal(empty.status, 400);
  assert.deepEqual(fieldsOf(empty).sort(), ['address', 'name', 'phone', 'timezone']); // email and website are not required
  const bad = async (over, field) => {
    const res = await api('POST', `${S}/shops`, { json: shopBody(over) });
    assert.equal(res.status, 400, JSON.stringify(over));
    assert.ok(fieldsOf(res).includes(field), `${JSON.stringify(over)} -> ${fieldsOf(res)}`);
  };
  await bad({ name: '' }, 'name');
  await bad({ name: 'x'.repeat(151) }, 'name');
  await bad({ name: 5 }, 'name');
  await bad({ address: '   ' }, 'address');
  await bad({ phone: 'x'.repeat(31) }, 'phone');
  await bad({ email: 'not-an-email' }, 'email');
  await bad({ email: 'a@b' }, 'email');
  await bad({ website: 'w'.repeat(256) }, 'website');
  await bad({ timezone: '(GMT +05:30) Colombo' }, 'timezone'); // not one of the five options
  await bad({ timezone: 'Asia/Colombo' }, 'timezone');
  await bad({ timezone: undefined }, 'timezone');
  for (const json of [[], 'text', null]) assert.equal((await api('POST', `${S}/shops`, { json })).status, 400);
  assert.deepEqual((await api('GET', `${S}/shops`)).body.data, []); // nothing was created
  assert.equal((await api('PUT', `${S}/shops/1`, { json: shopBody() })).status, 404);
});

test('shop profiles: unknown and malformed ids', async () => {
  for (const id of ['abc', '0', '-1', '1.5']) assert.equal((await api('GET', `${S}/shops/${id}`)).status, 400, id);
  assert.equal((await api('GET', `${S}/shops/99`)).status, 404);
  assert.equal((await api('PUT', `${S}/shops/99`, { json: shopBody() })).status, 404);
  assert.equal((await api('POST', `${S}/shops/99/image`, { form: imageForm(PNG) })).status, 404);
  assert.equal(listDir(uploads.settingsDir).length, 0, 'no file is written for an unknown profile');
});

// ---------- authentication, sessions and scope ----------
test('every Settings route refuses a request without a valid token', async () => {
  ctx.token = null;
  for (const [method, url] of [['GET', '/timezones'], ['GET', '/shops'], ['POST', '/shops'], ['GET', '/shops/1'], ['PUT', '/shops/1'], ['POST', '/shops/1/image']]) {
    const res = await api(method, `${S}${url}`, method === 'GET' ? {} : { json: {} });
    assert.equal(res.status, 401, `${method} ${url}`);
  }
  assert.equal((await api('GET', `${S}/shops`, as('not.a.token'))).status, 401);
});

test('a revoked session is refused everywhere, a missing Auth Service fails closed (503), and the internal key is no login', async () => {
  const { token, sid } = ctx.auth.token(OWNER);
  assert.equal((await api('GET', `${S}/shops`, as(token))).status, 200);
  ctx.auth.revoke(sid);
  assert.equal((await api('GET', `${S}/shops`, as(token))).status, 401, 'revoked in the Auth Service');

  ctx.token = null;
  assert.equal((await api('GET', `${S}/shops`, { headers: internal })).status, 401, 'X-Internal-Key does not authenticate a user');

  const down = require('../../app').createApp({ authBaseUrl: 'http://127.0.0.1:1' }).listen(0, '127.0.0.1');
  await new Promise((resolve) => down.once('listening', resolve));
  const res = await fetch(`http://127.0.0.1:${down.address().port}${S}/shops`, as(ctx.auth.token(OWNER).token));
  assert.deepEqual([res.status, (await res.json()).code], [503, 'SERVICE_UNAVAILABLE']);
  assert.equal((await fetch(`http://127.0.0.1:${down.address().port}${S}/shops`, as('not.a.token'))).status, 401, 'a bad token is still 401, decided locally');
  await new Promise((resolve) => down.close(resolve));
});

test('accounts are isolated: a user sees and changes only their own account', async () => {
  const rival = tokenFor({ userId: 9001, accountId: 2, role: 'owner' });
  const myShop = await makeShop({ name: 'My Shop' });
  const rivalShop = (await api('POST', `${S}/shops`, { json: shopBody({ name: 'Rival Shop' }), ...as(rival) })).body.data;

  assert.deepEqual((await api('GET', `${S}/shops`)).body.data.map((s) => s.name), ['My Shop']);
  assert.deepEqual((await api('GET', `${S}/shops`, as(rival))).body.data.map((s) => s.name), ['Rival Shop']);
  assert.equal(store.shopProfiles.get(myShop.id).accountId, 1, 'the account comes from the token, not from the body');
  assert.equal(store.shopProfiles.get(rivalShop.id).accountId, 2);
  const forged = await api('POST', `${S}/shops`, { json: { ...shopBody({ name: 'Forged' }), accountId: 2, ownerId: 77 } });
  assert.deepEqual([store.shopProfiles.get(forged.body.data.id).accountId, store.shopProfiles.get(forged.body.data.id).ownerId], [1, 9000]);

  // Another account's records answer 404, exactly like records that do not exist.
  for (const [method, url, body] of [
    ['GET', `/shops/${rivalShop.id}`], ['PUT', `/shops/${rivalShop.id}`, shopBody()], ['POST', `/shops/${rivalShop.id}/image`],
  ]) {
    const res = await api(method, `${S}${url}`, body ? { json: body } : method === 'POST' ? { form: imageForm(PNG) } : {});
    assert.equal(res.status, 404, `${method} ${url}`);
  }
  assert.equal((await api('GET', `${S}/shops/${myShop.id}`, as(rival))).status, 404, 'and the other way round');
  assert.equal(listDir(uploads.settingsDir).length, 0);
});

test('only the owner creates shops; any signed-in user of the account may edit one', async () => {
  const admin = tokenFor({ userId: 9002, accountId: 1, role: 'admin' });
  assert.equal((await api('POST', `${S}/shops`, { json: shopBody(), ...as(admin) })).status, 403);
  const shop = await makeShop();
  assert.equal((await api('PUT', `${S}/shops/${shop.id}`, { json: shopBody({ name: 'Renamed' }), ...as(admin) })).status, 200);
  assert.equal((await api('GET', `${S}/shops`, as(admin))).status, 200);
});

// ---------- shop logos ----------
test('shop logos: stored in the service folder under generated names, replaced files are deleted', async () => {
  const shop = await makeShop();
  const logo = await api('POST', `${S}/shops/${shop.id}/image`, { form: imageForm(PNG, '../../evil name.php') });
  assert.equal(logo.status, 200, JSON.stringify(logo.body));
  assert.match(logo.body.data.image, /^\/uploads\/settings\/[0-9a-f-]{36}\.png$/); // client filename ignored
  const logoName = path.basename(logo.body.data.image);
  uploaded.add(logoName);
  assert.ok(fs.existsSync(path.join(uploads.settingsDir, logoName)));
  const served = await fetch(ctx.base + logo.body.data.image);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');

  const replaced = await api('POST', `${S}/shops/${shop.id}/image`, { form: imageForm(JPEG, 'photo.jpeg') });
  assert.match(replaced.body.data.image, /\.jpg$/);
  uploaded.add(path.basename(replaced.body.data.image));
  assert.ok(!fs.existsSync(path.join(uploads.settingsDir, logoName)), 'the replaced file is deleted');
  assert.equal((await api('GET', `${S}/shops/${shop.id}`)).body.data.image, replaced.body.data.image);
});

test('shop logos: size, content and field checks', async () => {
  const shop = await makeShop();
  const url = `${S}/shops/${shop.id}/image`;
  const before = listDir(uploads.settingsDir).length;

  const big = await api('POST', url, { form: imageForm(Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(2 * 1024 * 1024 + 1, 1)])) });
  assert.equal(big.status, 413);
  assert.equal(big.body.code, 'IMAGE_TOO_LARGE');
  assert.equal((await api('POST', url, { form: imageForm(Buffer.from('<?php echo 1; ?>'), 'shell.png') })).status, 415);
  assert.equal((await api('POST', url, { form: imageForm(PNG.subarray(0, PNG.length - 6)) })).status, 415); // truncated
  assert.equal((await api('POST', url, { form: new FormData() })).status, 400); // no file
  assert.equal((await api('POST', url, { form: imageForm(PNG, 'a.png', 'logo') })).status, 400); // wrong field name
  const withText = imageForm(PNG);
  withText.append('note', 'extra');
  assert.equal((await api('POST', url, { form: withText })).status, 400);
  assert.equal((await api('POST', url, { json: { image: 'x' } })).status, 400);
  assert.equal(listDir(uploads.settingsDir).length, before, 'rejected uploads write nothing');
  assert.equal((await api('GET', `${S}/shops/${shop.id}`)).body.data.image, null);
});

// ---------- internal endpoints (service to service) ----------
test('internal: only a caller with the internal key can list shops or create the first shop', async () => {
  ctx.token = null;
  assert.equal((await api('GET', '/internal/accounts/1/shops')).status, 401);
  assert.equal((await api('GET', '/internal/accounts/1/shops', { headers: { 'x-internal-key': 'x'.repeat(40) } })).status, 401);
  assert.equal((await api('PUT', '/internal/accounts/1/first-shop', { json: {} })).status, 401);
  assert.deepEqual((await api('GET', '/internal/accounts/1/shops', { headers: internal })).body.data, []);
  assert.equal((await api('GET', '/internal/accounts/abc/shops', { headers: internal })).status, 400);
});

test('internal: the first shop is created once per account (a retry returns the same shop) and carries no profile data out', async () => {
  ctx.token = null;
  const body = { ownerId: 5, name: 'POS CAFE', address: 'Jaffna', phone: '+94 71 234 5678' };
  const first = await api('PUT', '/internal/accounts/7/first-shop', { json: body, headers: internal });
  const retry = await api('PUT', '/internal/accounts/7/first-shop', { json: { ...body, name: 'Other' }, headers: internal });
  assert.deepEqual([first.status, retry.status], [200, 200]);
  assert.deepEqual(retry.body.data, first.body.data);
  assert.deepEqual(first.body.data, { id: 1, name: 'POS CAFE', timezone: null });
  assert.equal(store.shopProfiles.size, 1, 'no second shop');
  assert.deepEqual([store.shopProfiles.get(1).accountId, store.shopProfiles.get(1).ownerId, store.shopProfiles.get(1).timezone], [7, 5, null]);
  assert.deepEqual((await api('GET', '/internal/accounts/7/shops', { headers: internal })).body.data, [{ id: 1, name: 'POS CAFE', timezone: null }]);
  assert.deepEqual((await api('GET', '/internal/accounts/8/shops', { headers: internal })).body.data, [], 'another account sees nothing');
  const invalid = await api('PUT', '/internal/accounts/9/first-shop', { json: { ownerId: 'x', name: '' }, headers: internal });
  assert.equal(invalid.status, 400);
  assert.deepEqual(fieldsOf(invalid).sort(), ['address', 'name', 'ownerId', 'phone']);
});

test('the service answers /health and puts a request id on every response', async () => {
  ctx.token = null;
  const res = await api('GET', '/health');
  assert.deepEqual(res.body.data, { service: 'settings-service', status: 'ok' });
  assert.ok(res.headers.get('x-request-id'));
  assert.equal(ctx.server.address().address, '127.0.0.1');
});
