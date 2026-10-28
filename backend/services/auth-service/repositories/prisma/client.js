// The Prisma client of the Auth Service (MySQL through the MariaDB driver adapter). Loaded only when
// REPOSITORY_DRIVER=prisma, so memory mode needs neither a generated client nor a database.
// The client must be generated first: `pnpm --filter @pos-cafe/auth-service db:generate`.
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const { env } = require('../../config');

let PrismaClient;
try {
  ({ PrismaClient } = require('../../generated/client'));
} catch {
  throw new Error('The Prisma client is not generated. Run: pnpm --filter @pos-cafe/auth-service db:generate');
}

const adapter = new PrismaMariaDb({ ...env.database, connectionLimit: 5 });
const prisma = new PrismaClient({ adapter });

module.exports = { prisma };
