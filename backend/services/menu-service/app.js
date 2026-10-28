const express = require('express');
const requestId = require('@pos-cafe/shared/middleware/requestId');
const notFound = require('@pos-cafe/shared/middleware/notFound');
const errorHandler = require('@pos-cafe/shared/middleware/errorHandler');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const { createJwt, JWT_ISSUER } = require('@pos-cafe/shared/jwt');
const { createAuthenticate, createAuthServiceClient } = require('@pos-cafe/shared/authenticate');
const { env, uploads } = require('./config');

// Builds the Menu Service app (server.js starts it; the tests start it on a random local port).
// Internal service: the browser talks to the API Gateway, never to this port.
// options.requireAuth: true = every Menu API route needs a signed-in user (see MENU_REQUIRE_AUTH); default = env.
// options.authBaseUrl: where the Auth Service is (the tests point it at a stand-in).
function createApp({ requireAuth = env.requireAuth, authBaseUrl } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.get('/health', (req, res) => sendSuccess(res, { data: { service: 'menu-service', status: 'ok' } }));

  // Product photos only. nosniff stops browsers guessing a type. Photos stay public (their names are random UUIDs).
  app.use(uploads.publicPath, express.static(uploads.productsDir, {
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }));

  app.use(express.json({ limit: '100kb' }));

  // Menu data is not shop-scoped (products have no shop yet); with requireAuth any signed-in user may use it.
  const guards = [];
  if (requireAuth) {
    guards.push(createAuthenticate({
      jwt: createJwt({ secret: env.jwtSecret, issuer: JWT_ISSUER }),
      verifySession: createAuthServiceClient({ baseUrl: authBaseUrl ?? env.authServiceUrl, internalKey: env.internalKey, timeoutMs: env.authTimeoutMs }),
    }));
  }
  app.use('/api/v1', ...guards, require('./routes/v1'));
  // Service-to-service endpoints (Sales). Not under /api, never routed by the Gateway, protected by the internal key.
  app.use('/internal', require('./routes/internalRoutes'));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
