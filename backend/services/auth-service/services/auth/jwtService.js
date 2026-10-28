// Signs and verifies access tokens with this service's JWT settings (the algorithm lives in @pos-cafe/shared/jwt).
const { createJwt } = require('@pos-cafe/shared/jwt');
const jwtConfig = require('../../config/auth/jwt');

module.exports = createJwt(jwtConfig);
