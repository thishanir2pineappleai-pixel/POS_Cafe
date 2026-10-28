// TEST SUPPORT (not used by any running service): a stand-in for the Settings Service that keeps the same internal
// contract (GET /internal/accounts/:id/shops, PUT /internal/accounts/:id/first-shop, protected by X-Internal-Key), so the
// Auth Service can be tested on its own. The real Settings Service is tested against the same contract in its own tests.
const http = require('node:http');
const { once } = require('node:events');

async function startFakeSettingsService({ internalKey }) {
  const shops = []; // { id, accountId, ownerId, name, timezone, body }
  let failing = false; // answers 500 while true, to test how callers cope

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const send = (status, body) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
      if (req.headers['x-internal-key'] !== internalKey) return send(401, { success: false });
      if (failing) return send(500, { success: false });
      const list = /^\/internal\/accounts\/(\d+)\/shops$/.exec(req.url);
      if (req.method === 'GET' && list) {
        return send(200, { success: true, data: shops.filter((s) => s.accountId === Number(list[1])).map(({ id, name, timezone }) => ({ id, name, timezone })) });
      }
      const first = /^\/internal\/accounts\/(\d+)\/first-shop$/.exec(req.url);
      if (req.method === 'PUT' && first) {
        const accountId = Number(first[1]);
        const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        let shop = shops.find((s) => s.accountId === accountId);
        if (!shop) { shop = { id: shops.length + 1, accountId, ownerId: body.ownerId, name: body.name, timezone: null, body }; shops.push(shop); }
        return send(200, { success: true, data: { id: shop.id, name: shop.name, timezone: shop.timezone } });
      }
      return send(404, { success: false });
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    shops,
    addShop: (accountId, name = 'POS CAFE') => { const shop = { id: shops.length + 1, accountId, ownerId: null, name, timezone: null }; shops.push(shop); return shop; },
    fail: (value = true) => { failing = value; },
    clear: () => { shops.length = 0; failing = false; },
    async stop() { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); },
  };
}

module.exports = { startFakeSettingsService };
