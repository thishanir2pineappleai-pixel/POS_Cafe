// Gives every request an id (kept when the caller sent a sane one), echoes it in the X-Request-Id response header and
// sets req.id, so one request can be followed through the Gateway and the services.
const crypto = require('node:crypto');

const SANE = /^[A-Za-z0-9._-]{1,64}$/;

function requestId(req, res, next) {
  const given = req.get('x-request-id');
  req.id = given && SANE.test(given) ? given : crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

module.exports = requestId;
