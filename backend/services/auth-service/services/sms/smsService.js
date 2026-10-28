// Sends verification SMS messages through the provider. Honest: delivered is true ONLY if a real provider accepted it.
const smsProvider = require('../integration/smsProvider');
const templates = require('./smsTemplateService');

async function sendVerificationCode(to, code) {
  const result = await smsProvider.send({ to, text: templates.verificationCode(code) });
  return { channel: 'sms', ...result };
}

module.exports = { sendVerificationCode };
