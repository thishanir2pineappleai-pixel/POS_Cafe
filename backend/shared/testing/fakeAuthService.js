// TEST SUPPORT (not used by any running service): a stand-in for the Auth Service that keeps the same contract
// (POST /internal/sessions/verify, protected by X-Internal-Key), so another service can be tested on its own with real
// signed tokens. The real Auth Service is tested against the same contract in its own tests.
const http = require('node:http');
const { once } = require('node:events');
const crypto = require('node:crypto');
const { createJwt } = require('../jwt');
const clock = require('../clock');

// { secret, internalKey }: the values the service under test was configured with.
async function startFakeAuthService({ secret, internalKey }) {
  const jwt = createJwt({ secret, issuer: 'pos-cafe', ttlSeconds: 3600 });
  const sessions = new Map(); // sid -> { userId, accountId, role, revoked }
  const calls = [];

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const send = (status, body) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
      if (req.method !== 'POST' || req.url !== '/internal/sessions/verify') return send(404, { success: false });
      if (req.headers['x-internal-key'] !== internalKey) return send(401, { success: false });
      const { sessionId, userId } = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      calls.push({ sessionId, userId });
      const s = sessions.get(sessionId);
      if (!s || s.revoked || s.userId !== userId) return send(200, { success: true, data: { active: false } });
      return send(200, { success: true, data: { active: true, auth: { userId, accountId: s.accountId, role: s.role, sessionId } } });
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    calls,
    // A signed token with an active session for this identity.
    token({ userId = 1, accountId = 1, role = 'owner', ttlSeconds = 3600 } = {}) {
      const sid = crypto.randomUUID();
      sessions.set(sid, { userId, accountId, role, revoked: false });
      return { token: jwt.sign({ sub: userId, sid, aid: accountId }, { ttlSeconds }).token, sid };
    },
    revoke: (sid) => { sessions.get(sid).revoked = true; },
    clearSessions: () => sessions.clear(),
    now: clock.now,
    async stop() { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); },
  };
}

module.exports = { startFakeAuthService };
