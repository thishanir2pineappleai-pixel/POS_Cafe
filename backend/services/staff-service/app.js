const express = require('express');
const requestId = require('@pos-cafe/shared/middleware/requestId');
const notFound = require('@pos-cafe/shared/middleware/notFound');
const errorHandler = require('@pos-cafe/shared/middleware/errorHandler');
const { sendSuccess } = require('@pos-cafe/shared/responses');

// Builds the Staff Service app (server.js starts it; the tests start it on a random local port).
// Internal service: the browser talks to the API Gateway, never to this port. Every route below needs a signed-in user:
// each router authenticates itself (the token is verified here, the session is confirmed by the Auth Service).
function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback'); // behind the Gateway, req.ip is the real client
  app.use(requestId);
  app.get('/health', (req, res) => sendSuccess(res, { data: { service: 'staff-service', status: 'ok' } }));
  app.use(express.json({ limit: '100kb' }));

  const { permissionRoutes, roleRoutes, teamRoutes } = require('./routes/v1/roleRoutes');
  app.use('/api/v1/staff', require('./routes/v1/staffRoutes'));
  app.use('/api/v1/permissions', permissionRoutes);
  app.use('/api/v1/roles', roleRoutes);
  app.use('/api/v1/teams', teamRoutes);
  app.use('/api/v1/shifts', require('./routes/v1/shiftRoutes'));
  app.use('/api/v1/attendance', require('./routes/v1/attendanceRoutes'));
  app.use('/api/v1/payroll', require('./routes/v1/payrollRoutes'));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
