// TEST SUPPORT (not used by any running service): a stand-in for the Menu Service that keeps the same internal contract
// (POST /internal/products/lookup, POST /internal/discounts/lookup, GET /internal/stock-overview, protected by X-Internal-Key),
// so the Sales Service can be tested on its own. The real Menu Service is tested against the same contract in its own tests.
const http = require('node:http');
const { once } = require('node:events');

async function startFakeMenuService({ internalKey }) {
  const products = new Map(); // id -> { id, name, categoryName, sellingPrice, image }
  const discounts = new Map(); // id -> { id, name, percentage }
  let stock = { source: 'menu_products', counts: { outOfStock: 0, lowStock: 0, inStock: 0 }, items: [] };
  let failing = false; // answers 500 while true, to test how callers cope
  const calls = [];

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const send = (status, body) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)); };
      if (req.headers['x-internal-key'] !== internalKey) return send(401, { success: false });
      if (failing) return send(500, { success: false });
      calls.push(`${req.method} ${req.url}`);
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      if (req.method === 'POST' && req.url === '/internal/products/lookup') return send(200, { success: true, data: body.ids.filter((id) => products.has(id)).map((id) => products.get(id)) });
      if (req.method === 'POST' && req.url === '/internal/discounts/lookup') return send(200, { success: true, data: body.ids.filter((id) => discounts.has(id)).map((id) => discounts.get(id)) });
      if (req.method === 'GET' && req.url.startsWith('/internal/stock-overview')) return send(200, { success: true, data: stock });
      return send(404, { success: false });
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    calls,
    addProduct: (id, name, sellingPrice, categoryName = 'Coffee') => { products.set(id, { id, name, categoryName, sellingPrice, image: null }); },
    addDiscount: (id, name, percentage) => { discounts.set(id, { id, name, percentage }); },
    setStock: (value) => { stock = value; },
    fail: (value = true) => { failing = value; },
    clear: () => { products.clear(); discounts.clear(); calls.length = 0; failing = false; },
    async stop() { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); },
  };
}

module.exports = { startFakeMenuService };
