const express = require('express');
const requestId = require('@pos-cafe/shared/middleware/requestId');
const notFound = require('@pos-cafe/shared/middleware/notFound');
const errorHandler = require('@pos-cafe/shared/middleware/errorHandler');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const { createJwt, JWT_ISSUER } = require('@pos-cafe/shared/jwt');
const { createAuthenticate, createAuthServiceClient } = require('@pos-cafe/shared/authenticate');
const { env, uploads } = require('./config');

// Builds the Settings Service app (server.js starts it; the tests start it on a random local port).
// Internal service: the browser talks to the API Gateway, never to this port.
// options.authBaseUrl: where the Auth Service is (the tests point it at a stand-in).
function createApp({ authBaseUrl } = {}) {
  // Every protected request: the token is verified here with the shared secret, then the Auth Service confirms the session.
  const authenticate = createAuthenticate({
    jwt: createJwt({ secret: env.jwtSecret, issuer: JWT_ISSUER }),
    verifySession: createAuthServiceClient({ baseUrl: authBaseUrl ?? env.authServiceUrl, internalKey: env.internalKey, timeoutMs: env.authTimeoutMs }),
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.get('/health', (req, res) => sendSuccess(res, { data: { service: 'settings-service', status: 'ok' } }));

  // Shop logos only. nosniff stops browsers guessing a type.
  app.use(uploads.settingsPublicPath, express.static(uploads.settingsDir, {
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }));

  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1/settings', require('./routes/v1/settingsRoutes')({ authenticate }));
  app.use('/internal', require('./routes/internalRoutes'));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
