const path = require('node:path');
const { env } = require('./env');
const { uploadsRoot } = require('@pos-cafe/shared/env');

const root = uploadsRoot(path.resolve(__dirname, '..'));

// Admin pictures live in this service's own folder, created on the first upload (git ignores services/*/uploads).
// They are served at /uploads/admins; shop logos are served by the Settings Service at /uploads/settings.
const uploads = Object.freeze({
  adminsDir: path.join(root, 'admins'),
  adminsPublicPath: '/uploads/admins',
  // PENDING APPROVAL: the Settings designs state no image formats or size, so admin pictures reuse the JPG/PNG, 2 MB rule.
});

module.exports = { env, uploads, policy: require('./auth/policy') };
