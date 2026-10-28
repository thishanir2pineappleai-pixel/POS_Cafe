// The Staff Service's connection to the Auth Service: every protected request is confirmed there (see
// @pos-cafe/shared/authenticate). If the Auth Service cannot be reached the request fails closed with 503.
const { createAuthServiceClient } = require('@pos-cafe/shared/authenticate');
const { env } = require('../../config');

let baseUrl = env.authServiceUrl;
const client = createAuthServiceClient({ baseUrl: () => baseUrl, internalKey: env.internalKey, timeoutMs: env.authTimeoutMs });

module.exports = {
  verifySession: client,
  // TEST HOOK: production code never calls this.
  useBaseUrl: (url) => { baseUrl = url; },
};
