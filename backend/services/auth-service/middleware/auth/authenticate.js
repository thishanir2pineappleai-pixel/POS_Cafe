// Protects this service's own routes (logout, me). Same checks every service makes (see @pos-cafe/shared/authenticate);
// the session is looked up locally because this service owns the sessions.
const { createAuthenticate } = require('@pos-cafe/shared/authenticate');
const jwtService = require('../../services/auth/jwtService');
const authService = require('../../services/auth/authService');

module.exports = createAuthenticate({ jwt: jwtService, verifySession: authService.verifySession });
