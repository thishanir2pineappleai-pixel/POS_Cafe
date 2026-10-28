// Shared test setup (not a test file): starts the real Auth Service app on a random 127.0.0.1 port, resets the
// in-memory repositories before every test, and offers a small fetch wrapper. No MySQL, no sample data.
// If ctx.token is set, api() sends it as "Authorization: Bearer ..." unless the call passes its own header.
const { before, after, beforeEach } = require('node:test');
const { once } = require('node:events');
const { createApp } = require('../../app');
const { store, reset } = require('../../repositories/memory/store');
const { sessionRepository } = require('../../repositories');
const settingsClient = require('../../services/integration/settingsClient');
const { startFakeSettingsService } = require('@pos-cafe/shared/testing/fakeSettingsService');
const { env } = require('../../config');
const { hashPassword } = require('@pos-cafe/shared/password');
const jwtService = require('../../services/auth/jwtService');
const { normalizePhone } = require('@pos-cafe/shared/validator');
const clock = require('@pos-cafe/shared/clock');

let current; // the ctx of the running test file, so addShop can reach its stand-in Settings Service

function useTestServer() {
  const ctx = { server: null, base: '', token: null, settings: null }; // settings: a stand-in for the Settings Service
  current = ctx;

  before(async () => {
    ctx.settings = await startFakeSettingsService({ internalKey: env.internalKey });
    settingsClient.useBaseUrl(ctx.settings.url);
    ctx.server = createApp().listen(0, '127.0.0.1');
    await once(ctx.server, 'listening');
    ctx.base = `http://127.0.0.1:${ctx.server.address().port}`;
  });
  after(async () => {
    await new Promise((resolve) => { ctx.server.closeAllConnections(); ctx.server.close(resolve); });
    await ctx.settings.stop();
  });
  beforeEach(() => { reset(); ctx.settings.clear(); ctx.token = null; });

  async function api(method, url, { json, form, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (ctx.token && !init.headers.authorization) init.headers.authorization = `Bearer ${ctx.token}`;
    if (json !== undefined) { init.body = JSON.stringify(json); init.headers['content-type'] = 'application/json'; }
    if (form) init.body = form;
    const res = await fetch(ctx.base + url, init);
    const bytes = Buffer.from(await res.arrayBuffer());
    const text = bytes.toString('utf8'); // unlike res.text(), keeps a leading byte order mark
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body, text, bytes, headers: res.headers };
  }

  return { ctx, api };
}

// ---- Fast fixtures (insert straight into the in-memory store; no HTTP and no sample data left behind) ----
const DEFAULT_PASSWORD = 'Abc@1234';
let sharedHash; // hashing is deliberately slow, so the default password is hashed once for the whole test process
const hashOf = (password) => (password === DEFAULT_PASSWORD ? (sharedHash ??= hashPassword(password)) : hashPassword(password));

// An active user. ids are explicit so tests can predict them; accountId groups users into accounts.
async function createUser({ id, accountId = 1, role = 'owner', email, password = DEFAULT_PASSWORD, firstName = 'Test', lastName = 'User', phone = '+94 71 000 0000', status = 'active' }) {
  const row = {
    id, accountId, role, status, firstName, lastName, phone, phoneNormalized: normalizePhone(phone), email,
    passwordHash: await hashOf(password), imagePath: null, emailVerifiedAt: null, phoneVerifiedAt: null,
    createdAt: new Date(clock.now()).toISOString(), updatedAt: new Date(clock.now()).toISOString(),
  };
  store.adminProfiles.set(id, row);
  return row;
}

// A real signed access token with a real session, without going through /auth/login.
async function tokenFor(userId, { ttlSeconds = 3600 } = {}) {
  const user = store.adminProfiles.get(userId);
  const now = clock.now();
  const session = await sessionRepository.create({ userId, accountId: user.accountId, createdAt: now, expiresAt: now + ttlSeconds * 1000 });
  return { ...jwtService.sign({ sub: userId, sid: session.sid, aid: user.accountId }, { ttlSeconds }), sid: session.sid };
}

// A shop of an account in the stand-in Settings Service.
const addShop = (accountId, name = 'POS CAFE') => current.settings.addShop(accountId, name);

module.exports = { useTestServer, createUser, tokenFor, addShop, DEFAULT_PASSWORD };
