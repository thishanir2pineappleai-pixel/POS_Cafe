// Shared test setup (not a test file): starts the real Settings Service app on a random 127.0.0.1 port, together with a
// stand-in for the Auth Service that keeps the same contract (@pos-cafe/shared/testing/fakeAuthService), so tokens are
// real signed JWTs and sessions are really confirmed over HTTP. In-memory repositories, no database, no sample data.
// If ctx.token is set, api() sends it as "Authorization: Bearer ..." unless the call passes its own header.
const { before, after, beforeEach } = require('node:test');
const { once } = require('node:events');
const { startFakeAuthService } = require('@pos-cafe/shared/testing/fakeAuthService');
const { createApp } = require('../../app');
const { reset } = require('../../repositories/memory/store');
const { env } = require('../../config');

function useTestServer() {
  const ctx = { server: null, base: '', token: null, auth: null };

  before(async () => {
    ctx.auth = await startFakeAuthService({ secret: env.jwtSecret, internalKey: env.internalKey });
    ctx.server = createApp({ authBaseUrl: ctx.auth.url }).listen(0, '127.0.0.1');
    await once(ctx.server, 'listening');
    ctx.base = `http://127.0.0.1:${ctx.server.address().port}`;
  });
  after(async () => {
    await new Promise((resolve) => { ctx.server.closeAllConnections(); ctx.server.close(resolve); });
    await ctx.auth.stop();
  });
  beforeEach(() => { reset(); ctx.auth.clearSessions(); ctx.token = null; });

  async function api(method, url, { json, form, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (ctx.token && !init.headers.authorization) init.headers.authorization = `Bearer ${ctx.token}`;
    if (json !== undefined) { init.body = JSON.stringify(json); init.headers['content-type'] = 'application/json'; }
    if (form) init.body = form;
    const res = await fetch(ctx.base + url, init);
    const bytes = Buffer.from(await res.arrayBuffer());
    const text = bytes.toString('utf8');
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: res.status, body, text, bytes, headers: res.headers };
  }

  // A signed token with an active session for this identity.
  const tokenFor = (identity) => ctx.auth.token(identity).token;

  return { ctx, api, tokenFor };
}

module.exports = { useTestServer };
