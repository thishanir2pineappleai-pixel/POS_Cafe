// Environment helpers every service uses. A service loads its own .env first, then the shared backend/.env
// (dotenv never overrides a variable that is already set, so the service file wins).
const crypto = require('node:crypto');
const path = require('node:path');
const dotenv = require('dotenv');

const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'];
const DEFAULT_CORS_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']; // the local Vite dev server

// serviceDir: the folder of the service that is starting.
function loadEnv(serviceDir) {
  dotenv.config({ path: path.join(serviceDir, '.env'), quiet: true });
  dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });
}

function parsePort(value, fallback) {
  const port = Number(value ?? fallback);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be a whole number from 0 to 65535');
  return port;
}

// Development only: refuse to bind to anything other than the local machine.
function parseHost(value) {
  const host = value || '127.0.0.1';
  if (!LOOPBACK_HOSTS.includes(host)) throw new Error(`HOST must be a loopback address (${LOOPBACK_HOSTS.join(', ')})`);
  return host;
}

function parseOrigins(value) {
  return value ? value.split(',').map((o) => o.trim()).filter(Boolean) : DEFAULT_CORS_ORIGINS;
}

// A shared secret (JWT_SECRET, INTERNAL_SERVICE_KEY). Production refuses to start without one. In development a random
// temporary value is used: it works inside one process only, so services that must agree on it need it in backend/.env.
function parseSecret(name, value, isProduction) {
  if (value) {
    if (value.length < 32) throw new Error(`${name} must be at least 32 characters`);
    return { secret: value, ephemeral: false };
  }
  if (isProduction) throw new Error(`${name} is required when NODE_ENV=production`);
  return { secret: crypto.randomBytes(32).toString('hex'), ephemeral: true };
}

function parseUrl(name, value, fallback) {
  try { return new URL(value || fallback).origin; } catch { throw new Error(`${name} must be a full URL such as ${fallback}`); }
}

function parsePositiveInt(name, value, fallback) {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a whole number from 1`);
  return n;
}

// Where a service keeps uploaded files: UPLOADS_DIR when set (for example a volume, or a temporary folder in tests),
// otherwise <serviceDir>/uploads. Each service creates its own subfolders inside it on the first upload.
function uploadsRoot(serviceDir) {
  return process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(serviceDir, 'uploads');
}

// REPOSITORY_DRIVER: where a service keeps its data. 'memory' (the default) loses everything on restart and needs no
// database, which keeps development and the automated tests simple; 'prisma' uses MySQL through Prisma.
// Production refuses 'memory': data that matters must not live in a process.
function parseRepositoryDriver(value, isProduction) {
  const driver = value || 'memory';
  if (!['memory', 'prisma'].includes(driver)) throw new Error('REPOSITORY_DRIVER must be memory or prisma');
  if (isProduction && driver !== 'prisma') throw new Error('REPOSITORY_DRIVER=prisma is required when NODE_ENV=production');
  return driver;
}

// A MySQL connection URL (mysql://user:password@host:3306/database) as the connection settings the MariaDB driver adapter
// takes. Only needed with REPOSITORY_DRIVER=prisma. Error messages NEVER contain the URL, because it holds the password.
function parseDatabaseUrl(name, value) {
  if (!value) throw new Error(`${name} is required when REPOSITORY_DRIVER=prisma (format: mysql://user:password@host:3306/database)`);
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} is not a valid URL (format: mysql://user:password@host:3306/database)`); }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (url.protocol !== 'mysql:' || !url.hostname || !url.username || !database) {
    throw new Error(`${name} must look like mysql://user:password@host:3306/database`);
  }
  const settings = {
    host: url.hostname, port: url.port ? Number(url.port) : 3306, user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database,
  };
  // MySQL 8 logs a brand-new account in with caching_sha2_password, which needs the server's RSA key (or TLS) the FIRST time the
  // password is checked. On the local machine (loopback) fetching that key cannot be intercepted, so it is allowed there and
  // nowhere else: for a remote database server use TLS or log the account in once with the mysql client.
  if (LOOPBACK_HOSTS.includes(settings.host)) settings.allowPublicKeyRetrieval = true;
  return settings;
}

module.exports = { parseRepositoryDriver, parseDatabaseUrl, uploadsRoot, loadEnv, parsePort, parseHost, parseOrigins, parseSecret, parseUrl, parsePositiveInt };
