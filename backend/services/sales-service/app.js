const express = require('express');
const requestId = require('@pos-cafe/shared/middleware/requestId');
const notFound = require('@pos-cafe/shared/middleware/notFound');
const errorHandler = require('@pos-cafe/shared/middleware/errorHandler');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const { createJwt, JWT_ISSUER } = require('@pos-cafe/shared/jwt');
const { createAuthenticate } = require('@pos-cafe/shared/authenticate');
const { env } = require('./config');
const authClient = require('./services/integration/authClient');

// Builds the Sales Service app (server.js starts it; the tests start it on a random local port).
// Internal service: the browser talks to the API Gateway, never to this port. Every /api/v1 route needs a signed-in user:
// the token is verified here with the shared secret, then the Auth Service confirms the session (fail closed with 503).
// The stand-in Auth Service of the tests is selected with authClient.useBaseUrl.
function createApp() {
  const authenticate = createAuthenticate({
    jwt: createJwt({ secret: env.jwtSecret, issuer: JWT_ISSUER }),
    verifySession: authClient.verifySession,
  });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback'); // behind the Gateway, req.ip is the real client
  app.use(requestId);
  app.get('/health', (req, res) => sendSuccess(res, { data: { service: 'sales-service', status: 'ok' } }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1', authenticate, require('./routes/v1')());

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
