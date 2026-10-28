// The Sales Service's connection to the Menu Service, which owns products and discount definitions. Prices, product names and
// discount definitions are asked there (service to service, with the shared internal key); this service never reads the Menu
// database. If the Menu Service cannot be reached the call fails with 503 (the caller never guesses a price).
const { createInternalClient } = require('@pos-cafe/shared/internalClient');
const { env } = require('../../config');

let baseUrl = env.menuServiceUrl;
const call = createInternalClient({ baseUrl: () => baseUrl, internalKey: env.internalKey, timeoutMs: env.menuTimeoutMs });

const LOOKUP_BATCH = 100; // the Menu endpoint accepts at most 100 ids per call

async function lookup(path, ids) {
  const found = [];
  for (let i = 0; i < ids.length; i += LOOKUP_BATCH) found.push(...await call('POST', path, { body: { ids: ids.slice(i, i + LOOKUP_BATCH) } }));
  return found;
}

module.exports = {
  // [{ id, name, categoryName, sellingPrice, image }] for the product ids that exist.
  lookupProducts: (ids) => lookup('/internal/products/lookup', [...new Set(ids)]),
  // [{ id, name, percentage }] for the discount definition ids that exist.
  lookupDiscounts: (ids) => lookup('/internal/discounts/lookup', [...new Set(ids)]),
  // { source, counts, items } for the Dashboard stock card.
  stockOverview: (limit) => call('GET', `/internal/stock-overview?limit=${limit}`),
  // TEST HOOK: production code never calls this.
  useBaseUrl: (url) => { baseUrl = url; },
};
