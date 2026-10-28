// Shared test setup (not a test file): starts the real Sales Service app on a random 127.0.0.1 port together with stand-ins for
// the Auth Service (sessions), the Settings Service (shops) and the Menu Service (prices, discounts, stock) that keep the real
// internal contracts (@pos-cafe/shared/testing/*). Tokens are real signed JWTs and every check really goes over HTTP.
// In-memory repositories, no database, no sample data.
// If ctx.token is set, api() sends it as "Authorization: Bearer ..." unless the call passes its own header.
const { before, after, beforeEach } = require('node:test');
const { once } = require('node:events');
const { startFakeAuthService } = require('@pos-cafe/shared/testing/fakeAuthService');
const { startFakeSettingsService } = require('@pos-cafe/shared/testing/fakeSettingsService');
const { startFakeMenuService } = require('@pos-cafe/shared/testing/fakeMenuService');
const { createApp } = require('../../app');
const { reset } = require('../../repositories/memory/store');
const authClient = require('../../services/integration/authClient');
const settingsClient = require('../../services/integration/settingsClient');
const menuClient = require('../../services/integration/menuClient');
const { env } = require('../../config');

function useTestServer() {
  const ctx = { server: null, base: '', token: null, auth: null, settings: null, menu: null };

  before(async () => {
    ctx.auth = await startFakeAuthService({ secret: env.jwtSecret, internalKey: env.internalKey });
    ctx.settings = await startFakeSettingsService({ internalKey: env.internalKey });
    ctx.menu = await startFakeMenuService({ internalKey: env.internalKey });
    authClient.useBaseUrl(ctx.auth.url);
    settingsClient.useBaseUrl(ctx.settings.url);
    menuClient.useBaseUrl(ctx.menu.url);
    ctx.server = createApp().listen(0, '127.0.0.1');
    await once(ctx.server, 'listening');
    ctx.base = `http://127.0.0.1:${ctx.server.address().port}`;
  });
  after(async () => {
    await new Promise((resolve) => { ctx.server.closeAllConnections(); ctx.server.close(resolve); });
    await ctx.auth.stop();
    await ctx.settings.stop();
    await ctx.menu.stop();
  });
  beforeEach(() => { reset(); ctx.auth.clearSessions(); ctx.settings.clear(); ctx.menu.clear(); ctx.token = null; });

  async function api(method, url, { json, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (ctx.token && !init.headers.authorization) init.headers.authorization = `Bearer ${ctx.token}`;
    if (json !== undefined) { init.body = JSON.stringify(json); init.headers['content-type'] = 'application/json'; }
    const res = await fetch(ctx.base + url, init);
    const bytes = Buffer.from(await res.arrayBuffer());
    const text = bytes.toString('utf8'); // unlike res.text(), keeps a leading byte order mark
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body, text, bytes, headers: res.headers };
  }

  // A signed token with an active session for this identity.
  const tokenFor = (identity) => ctx.auth.token(identity).token;

  // Signs in as `identity` (default: the owner of account 1) and gives the account a shop; returns the shop.
  function signIn(identity = { userId: 1, accountId: 1, role: 'owner' }, { shop = true } = {}) {
    ctx.token = tokenFor(identity);
    return shop ? ctx.settings.addShop(identity.accountId, 'POS CAFE') : null;
  }

  return { ctx, api, tokenFor, signIn };
}

module.exports = { useTestServer };
