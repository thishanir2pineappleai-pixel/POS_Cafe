// The Gateway against a fake upstream service (to see exactly what is forwarded) and against the real Auth Service app.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const { once } = require('node:events');
const { createApp } = require('../app');
const { createApp: createAuthApp } = require('../../services/auth-service/app');

const servers = [];
const listen = async (handler) => {
  const server = (typeof handler === 'function' ? http.createServer(handler) : handler).listen(0, '127.0.0.1');
  await once(server, 'listening');
  servers.push(server);
  return { server, url: `http://127.0.0.1:${server.address().port}` };
};
after(async () => {
  for (const s of servers) { s.closeAllConnections?.(); await new Promise((resolve) => s.close(resolve)); }
});

// A fake service that answers with everything it received.
const echoHandler = (req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    if (req.url === '/health') { res.setHeader('content-type', 'application/json'); return res.end('{"success":true}'); }
    res.setHeader('content-type', 'application/json');
    res.setHeader('x-upstream', 'yes');
    res.statusCode = req.url.includes('teapot') ? 418 : 200;
    return res.end(JSON.stringify({
      method: req.method, url: req.url, headers: req.headers, bytes: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex'), text: body.length < 1000 ? body.toString() : null,
    }));
  });
};

const baseConfig = (target, over = {}) => ({
  corsOrigins: ['http://localhost:5173'],
  upstreamTimeoutMs: 15000, // generous: logins hash a password, and other packages' tests may be running in parallel
  rateLimitPerMinute: 1000,
  maxBodyBytes: 10 * 1024 * 1024,
  routes: [{ prefix: '/api/v1/auth', name: 'auth-service', target }],
  ...over,
});
const startGateway = async (target, over) => (await listen(createApp(baseConfig(target, over)))).url;
const readJson = async (res) => ({ status: res.status, headers: res.headers, body: await res.json() });

test('forwards method, path, query, headers and JSON body, and returns the status and body unchanged', async () => {
  const up = await listen(echoHandler);
  const gw = await startGateway(up.url);
  const res = await readJson(await fetch(`${gw}/api/v1/auth/login?x=1&y=two`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer abc' }, body: '{"email":"a@b.c"}',
  }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-upstream'), 'yes');
  assert.deepEqual([res.body.method, res.body.url, res.body.text], ['POST', '/api/v1/auth/login?x=1&y=two', '{"email":"a@b.c"}']);
  assert.equal(res.body.headers.authorization, 'Bearer abc');
  const teapot = await readJson(await fetch(`${gw}/api/v1/auth/teapot`));
  assert.equal(teapot.status, 418, 'upstream status codes pass through');
});

test('request ids: generated, kept when sane, replaced when not, and sent to the service', async () => {
  const up = await listen(echoHandler);
  const gw = await startGateway(up.url);
  const a = await readJson(await fetch(`${gw}/api/v1/auth/x`));
  assert.match(a.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  assert.equal(a.body.headers['x-request-id'], a.headers.get('x-request-id'));
  const b = await readJson(await fetch(`${gw}/api/v1/auth/x`, { headers: { 'x-request-id': 'trace-123' } }));
  assert.equal(b.headers.get('x-request-id'), 'trace-123');
  assert.equal(b.body.headers['x-request-id'], 'trace-123');
  const c = await readJson(await fetch(`${gw}/api/v1/auth/x`, { headers: { 'x-request-id': 'bad id with spaces <script>' } }));
  assert.match(c.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  assert.equal((await readJson(await fetch(`${gw}/nope`))).headers.get('x-request-id').length > 0, true, 'also on errors');
});

test('client-sent forwarding and internal headers are not trusted or passed on', async () => {
  const up = await listen(echoHandler);
  const gw = await startGateway(up.url);
  const res = await readJson(await fetch(`${gw}/api/v1/auth/x`, { headers: { 'x-forwarded-for': '6.6.6.6', 'x-internal-key': 'secret'.repeat(8) } }));
  assert.ok(!res.body.headers['x-forwarded-for'].includes('6.6.6.6'), res.body.headers['x-forwarded-for']);
  assert.equal(res.body.headers['x-internal-key'], undefined);
});

test('large binary bodies (uploads) are streamed through intact', async () => {
  const up = await listen(echoHandler);
  const gw = await startGateway(up.url);
  const payload = crypto.randomBytes(3 * 1024 * 1024);
  const res = await readJson(await fetch(`${gw}/api/v1/auth/upload`, { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: payload }));
  assert.equal(res.body.bytes, payload.length);
  assert.equal(res.body.sha256, crypto.createHash('sha256').update(payload).digest('hex'));
});

test('a body larger than the cap is refused with 413 before it reaches a service', async () => {
  const up = await listen(echoHandler);
  const gw = await startGateway(up.url, { maxBodyBytes: 1000 });
  const res = await readJson(await fetch(`${gw}/api/v1/auth/x`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pad: 'x'.repeat(2000) }) }));
  assert.equal(res.status, 413);
  assert.equal(res.body.success, false);
});

test('unrouted paths and /internal are 404 in the standard envelope (never forwarded)', async () => {
  const up = await listen(echoHandler);
  const gw = await startGateway(up.url);
  for (const path of ['/nope', '/api/v1/staff', '/internal/sessions/verify', '/api/v1/auth-evil']) {
    const res = await readJson(await fetch(`${gw}${path}`, { method: path.startsWith('/internal') ? 'POST' : 'GET' }));
    assert.deepEqual([res.status, res.body.success, res.body.code], [404, false, 'NOT_FOUND'], path);
  }
});

test('an unreachable service is 503 and a slow one is 504, both in the standard envelope', async () => {
  const dead = await listen(echoHandler);
  const deadUrl = dead.url;
  dead.server.closeAllConnections(); await new Promise((resolve) => dead.server.close(resolve));
  const gwDown = await startGateway(deadUrl);
  const down = await readJson(await fetch(`${gwDown}/api/v1/auth/x`));
  assert.deepEqual([down.status, down.body.code], [503, 'SERVICE_UNAVAILABLE']);

  const slow = await listen((req, res) => setTimeout(() => res.end('{}'), 3000));
  const gwSlow = await startGateway(slow.url, { upstreamTimeoutMs: 300 });
  const started = Date.now();
  const late = await readJson(await fetch(`${gwSlow}/api/v1/auth/x`));
  assert.deepEqual([late.status, late.body.code], [504, 'GATEWAY_TIMEOUT']);
  assert.ok(Date.now() - started < 2500, 'answered at the timeout, not when the service finally replied');

  const crashing = await listen((req) => req.socket.destroy()); // closes the connection straight away
  const gwCrash = await startGateway(crashing.url, { upstreamTimeoutMs: 1000 });
  const crashed = await readJson(await fetch(`${gwCrash}/api/v1/auth/x`));
  assert.deepEqual([crashed.status, crashed.body.code], [503, 'SERVICE_UNAVAILABLE'], 'a quick reset is not a timeout');
});

test('rate limit: the limit-plus-one request from one IP is 429 with Retry-After', async () => {
  const up = await listen(echoHandler);
  const gw = await startGateway(up.url, { rateLimitPerMinute: 3 });
  for (let i = 0; i < 3; i += 1) assert.equal((await fetch(`${gw}/api/v1/auth/x`)).status, 200);
  const res = await readJson(await fetch(`${gw}/api/v1/auth/x`));
  assert.deepEqual([res.status, res.body.code], [429, 'TOO_MANY_REQUESTS']);
  assert.ok(Number(res.headers.get('retry-after')) >= 1);
});

test('CORS: the local frontend origin may call with an Authorization header, other origins may not', async () => {
  const up = await listen(echoHandler);
  const gw = await startGateway(up.url);
  const ok = await fetch(`${gw}/api/v1/auth/login`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.match(ok.headers.get('access-control-allow-headers'), /authorization/i);
  const evil = await fetch(`${gw}/api/v1/auth/login`, { method: 'OPTIONS', headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST' } });
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
});

test('health: /health is the Gateway itself, /health/services reports every routed service', async () => {
  const up = await listen(echoHandler);
  const gw = await startGateway(up.url);
  assert.deepEqual((await readJson(await fetch(`${gw}/health`))).body.data, { service: 'gateway', status: 'ok' });
  const all = await readJson(await fetch(`${gw}/health/services`));
  assert.deepEqual([all.status, all.body.data], [200, { gateway: 'ok', services: { 'auth-service': 'ok' } }]);
  const gwDown = await startGateway('http://127.0.0.1:1');
  const bad = await readJson(await fetch(`${gwDown}/health/services`));
  assert.deepEqual([bad.status, bad.body.data.services], [503, { 'auth-service': 'unreachable' }]);
});

test('end to end with the real Auth Service: its answers and errors arrive unchanged through the Gateway', async () => {
  const auth = await listen(createAuthApp());
  const gw = await startGateway(auth.url);
  const login = await readJson(await fetch(`${gw}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'nobody@poscafe.com', password: 'Abc@1234' }) }));
  assert.deepEqual([login.status, login.body.code], [401, 'INVALID_CREDENTIALS']);
  const invalid = await readJson(await fetch(`${gw}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
  assert.deepEqual([invalid.status, invalid.body.code], [400, 'VALIDATION_ERROR']);
  const me = await readJson(await fetch(`${gw}/api/v1/auth/me`));
  assert.deepEqual([me.status, me.body.code], [401, 'UNAUTHENTICATED']);
  assert.equal(me.headers.get('www-authenticate'), 'Bearer');
  const internal = await readJson(await fetch(`${gw}/internal/sessions/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }));
  assert.equal(internal.status, 404, 'the internal endpoint exists on the service but not through the Gateway');
  assert.equal((await readJson(await fetch(`${gw}/health/services`))).body.data.services['auth-service'], 'ok');
});
