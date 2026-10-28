// The Sales Service's connection to the Settings Service, which owns shop profiles. Orders belong to a shop, so the shops
// of the caller's account are asked there (service to service, with the shared internal key). If the Settings Service
// cannot be reached the call fails with 503; the caller never guesses a shop.
const { createInternalClient } = require('@pos-cafe/shared/internalClient');
const { env } = require('../../config');

let baseUrl = env.settingsServiceUrl;
const call = createInternalClient({ baseUrl: () => baseUrl, internalKey: env.internalKey, timeoutMs: env.settingsTimeoutMs });

module.exports = {
  // [{ id, name, timezone }] of an account.
  listShops: (accountId) => call('GET', `/internal/accounts/${accountId}/shops`),
  // TEST HOOK: production code never calls this.
  useBaseUrl: (url) => { baseUrl = url; },
};
