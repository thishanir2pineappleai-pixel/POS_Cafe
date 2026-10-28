const express = require('express');
const requestId = require('@pos-cafe/shared/middleware/requestId');
const notFound = require('@pos-cafe/shared/middleware/notFound');
const errorHandler = require('@pos-cafe/shared/middleware/errorHandler');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const { env, uploads } = require('./config');
const { store } = require('./repositories/memory/store');

// Builds the Auth Service app (server.js starts it; the tests start it on a random local port).
// Internal service: the browser talks to the API Gateway, never to this port.
function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback'); // behind the Gateway, req.ip is the real client (X-Forwarded-For), so per-IP limits work
  app.use(requestId);
  app.get('/health', (req, res) => sendSuccess(res, { data: { service: 'auth-service', status: 'ok' } }));
  // Admin pictures only. nosniff stops browsers guessing a type.
  app.use(uploads.adminsPublicPath, express.static(uploads.adminsDir, {
    index: false,
    dotfiles: 'deny',
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  }));

  app.use(express.json({ limit: '100kb' }));

  app.use('/api/v1/auth', require('./routes/v1/authRoutes'));
  app.use('/api/v1/settings/admins', require('./routes/v1/adminRoutes')); // admin profiles = the login users
  app.use('/internal', require('./routes/internalRoutes'));

  // LOCAL TESTING ONLY: shows the messages (including raw codes) that MESSAGE_DELIVERY=dev-outbox captured instead of sending.
  // The route does not exist in any other mode, and the setting is refused when NODE_ENV=production (see config/env).
  if (env.messageDelivery === 'dev-outbox') {
    app.get('/api/v1/dev/outbox', (req, res) => res.json({ success: true, data: store.outbox }));
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
