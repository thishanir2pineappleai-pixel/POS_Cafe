const path = require('node:path');
const {
  loadEnv, parsePort, parseHost, parseSecret, parseUrl, parsePositiveInt, parseRepositoryDriver, parseDatabaseUrl,
} = require('@pos-cafe/shared/env');

loadEnv(path.resolve(__dirname, '../..'));

const isProduction = process.env.NODE_ENV === 'production';
const jwt = parseSecret('JWT_SECRET', process.env.JWT_SECRET, isProduction);
const internal = parseSecret('INTERNAL_SERVICE_KEY', process.env.INTERNAL_SERVICE_KEY, isProduction);

const repositoryDriver = parseRepositoryDriver(process.env.REPOSITORY_DRIVER, isProduction);

const env = Object.freeze({
  repositoryDriver,
  // Connection settings parsed from STAFF_DATABASE_URL (null in memory mode). The URL itself is never kept or printed.
  database: repositoryDriver === 'prisma' ? parseDatabaseUrl('STAFF_DATABASE_URL', process.env.STAFF_DATABASE_URL) : null,
  port: parsePort(process.env.STAFF_SERVICE_PORT, 4003),
  host: parseHost(process.env.HOST),
  isProduction,
  jwtSecret: jwt.secret,
  jwtSecretIsEphemeral: jwt.ephemeral,
  internalKey: internal.secret,
  internalKeyIsEphemeral: internal.ephemeral,
  authServiceUrl: parseUrl('AUTH_SERVICE_URL', process.env.AUTH_SERVICE_URL, 'http://127.0.0.1:4001'),
  authTimeoutMs: parsePositiveInt('AUTH_TIMEOUT_MS', process.env.AUTH_TIMEOUT_MS, 3000),
  settingsServiceUrl: parseUrl('SETTINGS_SERVICE_URL', process.env.SETTINGS_SERVICE_URL, 'http://127.0.0.1:4002'),
  settingsTimeoutMs: parsePositiveInt('SETTINGS_TIMEOUT_MS', process.env.SETTINGS_TIMEOUT_MS, 3000),
});

module.exports = { env };
