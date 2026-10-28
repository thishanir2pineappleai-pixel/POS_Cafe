const path = require('node:path');
const { env } = require('./env');
const { uploadsRoot } = require('@pos-cafe/shared/env');

const root = uploadsRoot(path.resolve(__dirname, '..'));
const { IMAGE_MAX_BYTES } = require('@pos-cafe/shared/uploads');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Staff pictures and staff documents: private folders in this service, created on the first upload (git ignores
// services/*/uploads). They are never served statically; they are readable only through the authenticated routes.
const uploads = Object.freeze({
  staffDir: path.join(root, 'staff'),
  staffDocumentsDir: path.join(root, 'staff-documents'),
  maxBytes: IMAGE_MAX_BYTES,
});

// PROVISIONAL limits (need approval), per signed-in user.
const policy = Object.freeze({
  rateLimits: {
    staffWrite: { windowMs: HOUR, max: 120 }, // create/change requests (creating hashes a password)
    staffUpload: { windowMs: HOUR, max: 60 }, // staff pictures and documents
  },
});

module.exports = { env, uploads, policy };
