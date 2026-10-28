// Email provider boundary. send({ to, subject, text }) resolves to { delivered, reason? } and NEVER throws.
//
//   * MESSAGE_DELIVERY=none (default): nothing leaves the server: { delivered: false, reason: 'not_configured' }.
//   * MESSAGE_DELIVERY=dev-outbox (never in production): the message, which contains the raw code, is kept in memory so a
//     developer or test can read it; still delivered:false because nothing was actually sent.
//   * MESSAGE_DELIVERY=smtp: the message is sent through the SMTP server in the SMTP_* settings (services/integration/smtpTransport.js).
//     delivered:true means the SMTP server ACCEPTED the message; it cannot promise the inbox. A failure answers
//     { delivered: false, reason: 'smtp_<category>' } (for example smtp_auth_failed, smtp_recipient_rejected, smtp_timeout).
//
// What is NEVER logged or returned: the code, the access key, the message text, the recipient, the SMTP password and the server's
// own error text. A failure logs one line with the category and the SMTP reply code, and nothing else.
const { env } = require('../../config');
const { store } = require('../../repositories/memory/store');
const clock = require('@pos-cafe/shared/clock');
const smtpTransport = require('./smtpTransport');

// The tests replace the SMTP connection with a stand-in (useTransport(fn); useTransport() restores the real one).
let transport = smtpTransport.sendMail;
const useTransport = (replacement) => { transport = replacement ?? smtpTransport.sendMail; };

async function send(message) {
  if (env.messageDelivery === 'dev-outbox') {
    store.outbox.push({ channel: 'email', ...message, at: new Date(clock.now()).toISOString() });
    return { delivered: false, reason: 'captured_in_dev_outbox' };
  }
  if (env.messageDelivery === 'smtp') {
    // Safety net: the test runner marks its processes with NODE_TEST_CONTEXT. A test must NEVER reach a real mail server, even
    // when the developer's backend/.env says MESSAGE_DELIVERY=smtp, so the real connection is refused there; a test that wants
    // to exercise sending installs a stand-in with useTransport().
    if (process.env.NODE_TEST_CONTEXT && transport === smtpTransport.sendMail) {
      return { delivered: false, reason: 'smtp_blocked_in_tests' };
    }
    try {
      await transport(env.smtp, { to: message.to, subject: message.subject, text: message.text });
      return { delivered: true };
    } catch (err) {
      const category = err instanceof smtpTransport.SmtpError ? err.category : 'connection'; // anything unexpected is reported as a lost connection
      console.warn(`[auth] email not sent: smtp_${category}${err.smtpCode ? ` (SMTP reply ${err.smtpCode})` : ''}`);
      return { delivered: false, reason: `smtp_${category}` };
    }
  }
  return { delivered: false, reason: 'not_configured' };
}

// Whether a REAL email provider is configured. Public responses may show this because it is the same for every request and so
// reveals nothing about any account.
const isConfigured = () => env.messageDelivery === 'smtp';

module.exports = { send, isConfigured, useTransport };
