// The Auth Service's connection to the Settings Service, which owns shop profiles. Only /internal endpoints are used
// (service to service, with the shared internal key). If the Settings Service cannot be reached the call fails with 503
// and the caller does not carry on as if it had worked.
const { createInternalClient } = require('@pos-cafe/shared/internalClient');
const { env } = require('../../config');

let baseUrl = env.settingsServiceUrl;
const call = createInternalClient({ baseUrl: () => baseUrl, internalKey: env.internalKey, timeoutMs: env.settingsTimeoutMs });

module.exports = {
  // [{ id, name, timezone }] of an account.
  listShops: (accountId) => call('GET', `/internal/accounts/${accountId}/shops`),
  // Creates the account's first shop (or returns it if a retry already created it). shop: { ownerId, name, address, phone }.
  createFirstShop: (accountId, shop) => call('PUT', `/internal/accounts/${accountId}/first-shop`, { body: shop }),
  // TEST HOOK: production code never calls this.
  useBaseUrl: (url) => { baseUrl = url; },
};
