// Shared test setup (not a test file): starts the real Staff Service app on a random 127.0.0.1 port together with stand-ins
// for the Auth Service (sessions) and the Settings Service (shops) that keep the real internal contracts
// (@pos-cafe/shared/testing/*). Tokens are real signed JWTs and every check really goes over HTTP. In-memory repositories,
// no database, no sample data.
// If ctx.token is set, api() sends it as "Authorization: Bearer ..." unless the call passes its own header.
const { before, after, beforeEach } = require('node:test');
const { once } = require('node:events');
const { startFakeAuthService } = require('@pos-cafe/shared/testing/fakeAuthService');
const { startFakeSettingsService } = require('@pos-cafe/shared/testing/fakeSettingsService');
const { createApp } = require('../../app');
const { reset } = require('../../repositories/memory/store');
const authClient = require('../../services/integration/authClient');
const settingsClient = require('../../services/integration/settingsClient');
const { env } = require('../../config');

let current; // the ctx of the running test file, so createUser / tokenFor / addShop can reach its stand-ins
const users = new Map(); // id -> { accountId, role }

function useTestServer() {
  const ctx = { server: null, base: '', token: null, auth: null, settings: null };
  current = ctx;

  before(async () => {
    ctx.auth = await startFakeAuthService({ secret: env.jwtSecret, internalKey: env.internalKey });
    ctx.settings = await startFakeSettingsService({ internalKey: env.internalKey });
    authClient.useBaseUrl(ctx.auth.url);
    settingsClient.useBaseUrl(ctx.settings.url);
    ctx.server = createApp().listen(0, '127.0.0.1');
    await once(ctx.server, 'listening');
    ctx.base = `http://127.0.0.1:${ctx.server.address().port}`;
  });
  after(async () => {
    await new Promise((resolve) => { ctx.server.closeAllConnections(); ctx.server.close(resolve); });
    await ctx.auth.stop();
    await ctx.settings.stop();
  });
  beforeEach(() => { reset(); ctx.auth.clearSessions(); ctx.settings.clear(); users.clear(); ctx.token = null; });

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

// ---- Fixtures. Users and shops live in the stand-in Auth and Settings services; this service stores neither. ----
// A signed-in identity: ids are explicit so tests can predict them; accountId groups users into accounts.
async function createUser({ id, accountId = 1, role = 'owner' }) {
  users.set(id, { accountId, role });
  return { id, accountId, role };
}

// A real signed access token with an active session (the stand-in Auth Service confirms it).
async function tokenFor(userId, { ttlSeconds = 3600 } = {}) {
  const { accountId, role } = users.get(userId);
  return current.auth.token({ userId, accountId, role, ttlSeconds });
}

// A shop of an account in the stand-in Settings Service.
const addShop = async (accountId, name = 'POS CAFE') => current.settings.addShop(accountId, name);

module.exports = { useTestServer, createUser, tokenFor, addShop };
