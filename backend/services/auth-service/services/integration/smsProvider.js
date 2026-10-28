// SMS provider boundary. send({ to, text }) resolves to { delivered, reason? } and NEVER throws.
// NO REAL SMS PROVIDER IS CONFIGURED OR IMPLEMENTED (the project structure mentions Notify.lk, but no account or key exists), so SMS
// stays DISABLED in every mode, including MESSAGE_DELIVERY=smtp (which sends email only): the answer is always
// { delivered: false, reason: 'not_configured' }. "dev-outbox" (never in production) additionally keeps the message in memory.
// To sign up locally without SMS, see DEV_SKIP_PHONE_VERIFICATION in config/env/index.js.
const { env } = require('../../config');
const { store } = require('../../repositories/memory/store');
const clock = require('@pos-cafe/shared/clock');

async function send(message) {
  if (env.messageDelivery === 'dev-outbox') {
    store.outbox.push({ channel: 'sms', ...message, at: new Date(clock.now()).toISOString() });
    return { delivered: false, reason: 'captured_in_dev_outbox' };
  }
  return { delivered: false, reason: 'not_configured' };
}

module.exports = { send };
