// Protects every Staff Service route. A request needs a valid access token (checked here with the shared secret) whose
// session the Auth Service confirms as active; if it cannot be reached the request fails closed (503).
// On success req.auth = { userId, accountId, role, sessionId }.
const { createAuthenticate } = require('@pos-cafe/shared/authenticate');
const { createJwt, JWT_ISSUER } = require('@pos-cafe/shared/jwt');
const { env } = require('../../config');
const authClient = require('../../services/integration/authClient');

module.exports = createAuthenticate({
  jwt: createJwt({ secret: env.jwtSecret, issuer: JWT_ISSUER }),
  verifySession: authClient.verifySession,
});
