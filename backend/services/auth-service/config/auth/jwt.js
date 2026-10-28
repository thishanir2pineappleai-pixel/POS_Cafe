const { env } = require('../env');
const policy = require('./policy');

// Access-token settings. Tokens are HMAC-SHA256 signed (see @pos-cafe/shared/jwt); no JWT package is used.
module.exports = Object.freeze({
  secret: env.jwtSecret,
  issuer: 'pos-cafe',
  ttlSeconds: policy.session.ttlSeconds,
  keepSignedInTtlSeconds: policy.session.keepSignedInTtlSeconds,
});
