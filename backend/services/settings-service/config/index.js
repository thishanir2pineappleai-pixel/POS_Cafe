const path = require('node:path');
const { env } = require('./env');
const { uploadsRoot } = require('@pos-cafe/shared/env');

const root = uploadsRoot(path.resolve(__dirname, '..'));

// Shop logos live in this service's own folder, created on the first upload (git ignores services/*/uploads).
const uploads = Object.freeze({
  settingsDir: path.join(root, 'settings'),
  settingsPublicPath: '/uploads/settings',
  // PENDING APPROVAL: the Settings designs show a camera/upload control but state no formats or size, so shop logos
  // reuse the JPG/PNG, 2 MB rule of product photos (@pos-cafe/shared/uploads).
});

module.exports = { env, uploads };
