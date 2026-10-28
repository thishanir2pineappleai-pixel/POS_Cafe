// Sends the account emails through the provider. Every function resolves to { channel, delivered, reason? } and is
// honest: delivered is true ONLY if a real provider accepted the message (none exists yet).
const emailProvider = require('../integration/emailProvider');
const templates = require('./templateService');

async function deliver(to, message) {
  const result = await emailProvider.send({ to, ...message });
  return { channel: 'email', ...result };
}

module.exports = {
  sendVerificationCode: (to, code) => deliver(to, templates.verificationCode(code)),
  sendPasswordResetCode: (to, code) => deliver(to, templates.passwordResetCode(code)),
  sendAccessKey: (to, key) => deliver(to, templates.accessKey(key)),
};
