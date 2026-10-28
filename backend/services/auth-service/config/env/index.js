const path = require('node:path');
const {
  loadEnv, parsePort, parseHost, parseSecret, parseUrl, parsePositiveInt, parseRepositoryDriver, parseDatabaseUrl,
} = require('@pos-cafe/shared/env');

loadEnv(path.resolve(__dirname, '../..'));

const isProduction = process.env.NODE_ENV === 'production';

// How verification codes and access keys leave the service:
//   none        (default) nothing is delivered.
//   dev-outbox  messages stay in memory for local testing only (never in production).
//   smtp        EMAIL is sent through the SMTP server named by the SMTP_* variables below. SMS is NOT sent in any mode: no SMS provider
//               exists, so the SMS channel always answers "not_configured" except in dev-outbox, which only captures it.
// Every parse function takes the production flag as a parameter so the tests can prove the production rules without a new process.
const DELIVERY_MODES = ['none', 'dev-outbox', 'smtp'];
function parseDelivery(value, production = isProduction) {
  const mode = value || 'none';
  if (!DELIVERY_MODES.includes(mode)) throw new Error(`MESSAGE_DELIVERY must be one of: ${DELIVERY_MODES.join(', ')}`);
  if (mode === 'dev-outbox' && production) throw new Error('MESSAGE_DELIVERY=dev-outbox is not allowed when NODE_ENV=production');
  return mode;
}

// SMTP settings, read only when MESSAGE_DELIVERY=smtp (null otherwise). A problem is reported by the NAME of the variable, never
// by its value, because the value may be a password.
//   SMTP_HOST      required. SMTP_PORT default 587 (465 when SMTP_SECURE=true).
//   SMTP_SECURE    true = encrypted from the first byte (port 465); false = connect, then upgrade with STARTTLS (port 587).
//                  Default: true only for port 465. When STARTTLS is not offered the message is NOT sent in plain text, unless the
//                  server runs on this machine (a local mail catcher).
//   SMTP_USER / SMTP_PASSWORD   both or neither. For Gmail the password is an "app password", never the account password.
//   SMTP_FROM      required: the sender address. SMTP_FROM_NAME optional display name. SMTP_TIMEOUT_MS whole-send limit.
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const SENDER_ADDRESS = /^[^\s<>"',;:\\\u0000-\u001f\u007f@]+@[^\s<>"',;:\\\u0000-\u001f\u007f@]+\.[^\s<>"',;:\\\u0000-\u001f\u007f@]+$/;
function parseSmtp(source, mode) {
  if (mode !== 'smtp') return null;
  const text = (name) => String(source[name] ?? '').trim();

  const host = text('SMTP_HOST');
  if (!host) throw new Error('SMTP_HOST is required when MESSAGE_DELIVERY=smtp (for example smtp.gmail.com)');
  if (!/^[A-Za-z0-9.:-]+$/.test(host)) throw new Error('SMTP_HOST must be a host name or IP address only (no scheme, path or spaces)');

  const secureText = text('SMTP_SECURE');
  if (secureText && !['true', 'false'].includes(secureText)) throw new Error('SMTP_SECURE must be true or false');
  const portText = text('SMTP_PORT');
  const port = portText ? Number(portText) : (secureText === 'true' ? 465 : 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT must be a whole number from 1 to 65535');
  const secure = secureText ? secureText === 'true' : port === 465;

  const user = text('SMTP_USER');
  const password = String(source.SMTP_PASSWORD ?? ''); // not trimmed: spaces can be part of a password
  if (Boolean(user) !== Boolean(password)) throw new Error('SMTP_USER and SMTP_PASSWORD must be set together (or both left empty for a server without sign-in)');

  const from = text('SMTP_FROM');
  if (!from) throw new Error('SMTP_FROM is required when MESSAGE_DELIVERY=smtp (the sender email address)');
  if (from.length > 254 || !SENDER_ADDRESS.test(from)) throw new Error('SMTP_FROM must be a plain email address such as no-reply@example.com');
  const fromName = text('SMTP_FROM_NAME').replace(/[\u0000-\u001f\u007f]/g, '') || 'PAI POS';
  if (fromName.length > 70) throw new Error('SMTP_FROM_NAME must be at most 70 characters');

  const timeoutMs = parsePositiveInt('SMTP_TIMEOUT_MS', source.SMTP_TIMEOUT_MS || undefined, 10000);
  if (timeoutMs > 60000) throw new Error('SMTP_TIMEOUT_MS must be at most 60000 (keep it below the Gateway limit UPSTREAM_TIMEOUT_MS, 15000 by default, or sign-up requests will time out first)');

  const tlsMode = secure ? 'implicit' : (LOOPBACK_HOSTS.includes(host) ? 'starttls-optional' : 'starttls-required');
  return Object.freeze({ host, port, tls: tlsMode, user, password, from, fromName, timeoutMs });
}

// LOCAL DEVELOPMENT ONLY. With no SMS provider the phone code can never be delivered, so signup would stop at the phone step.
// DEV_SKIP_PHONE_VERIFICATION=true lets a signup continue WITHOUT verifying the phone number: the number is kept, but it is stored
// as NOT verified, and the response says the verification was skipped. Production refuses to start with it. Email verification
// is never affected by it.
function parseSkipPhoneVerification(value, production = isProduction) {
  if (value === undefined || value === '') return false;
  if (!['true', 'false'].includes(value)) throw new Error('DEV_SKIP_PHONE_VERIFICATION must be true or false');
  if (value === 'true' && production) throw new Error('DEV_SKIP_PHONE_VERIFICATION=true is a local-development bypass and is not allowed when NODE_ENV=production');
  return value === 'true';
}

const jwt = parseSecret('JWT_SECRET', process.env.JWT_SECRET, isProduction);
const internal = parseSecret('INTERNAL_SERVICE_KEY', process.env.INTERNAL_SERVICE_KEY, isProduction);

const repositoryDriver = parseRepositoryDriver(process.env.REPOSITORY_DRIVER, isProduction);
const messageDelivery = parseDelivery(process.env.MESSAGE_DELIVERY);

const env = Object.freeze({
  repositoryDriver,
  // Connection settings parsed from AUTH_DATABASE_URL (null in memory mode). The URL itself is never kept or printed.
  database: repositoryDriver === 'prisma' ? parseDatabaseUrl('AUTH_DATABASE_URL', process.env.AUTH_DATABASE_URL) : null,
  port: parsePort(process.env.AUTH_SERVICE_PORT, 4001),
  host: parseHost(process.env.HOST),
  isProduction,
  jwtSecret: jwt.secret,
  jwtSecretIsEphemeral: jwt.ephemeral,
  internalKey: internal.secret,
  internalKeyIsEphemeral: internal.ephemeral,
  messageDelivery,
  smtp: parseSmtp(process.env, messageDelivery), // null unless MESSAGE_DELIVERY=smtp; holds the SMTP password, so never print it
  skipPhoneVerification: parseSkipPhoneVerification(process.env.DEV_SKIP_PHONE_VERIFICATION),
  // The Settings Service owns shops: signup activation creates the first shop there and GET /auth/me lists an account's shops from it.
  settingsServiceUrl: parseUrl('SETTINGS_SERVICE_URL', process.env.SETTINGS_SERVICE_URL, 'http://127.0.0.1:4002'),
  settingsTimeoutMs: parsePositiveInt('SETTINGS_TIMEOUT_MS', process.env.SETTINGS_TIMEOUT_MS, 3000),
});

module.exports = { env, parseDelivery, parseSmtp, parseSkipPhoneVerification };
