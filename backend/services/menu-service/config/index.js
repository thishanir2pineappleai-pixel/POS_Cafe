const path = require('node:path');
const { env } = require('./env');
const { uploadsRoot } = require('@pos-cafe/shared/env');
const { IMAGE_MAX_BYTES } = require('@pos-cafe/shared/uploads');

// Product photos live in this service's own folder, created on the first upload (git ignores services/*/uploads).
const root = uploadsRoot(path.resolve(__dirname, '..'));
const uploads = Object.freeze({
  productsDir: path.join(root, 'products'),
  publicPath: '/uploads/products',
  maxBytes: IMAGE_MAX_BYTES, // CONFIRMED (Figma): JPG/PNG, maximum 2 MB.
});

module.exports = { env, uploads };
