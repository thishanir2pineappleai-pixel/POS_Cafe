// Prisma CLI configuration of the Sales Service (generate, migrate). The connection URLs come from the environment
// (backend/.env or this service's .env), never from this file:
//   SALES_MIGRATION_DATABASE_URL (optional) same format, an account allowed to CREATE/ALTER tables; used ONLY by these CLI commands
//   SALES_DATABASE_URL         mysql://user:password@host:3306/pos_sales_db
//   SALES_SHADOW_DATABASE_URL  mysql://user:password@host:3306/pos_sales_db_shadow   (only `migrate dev` needs it)
// The db:* package scripts (generate, migrate:dev, migrate:deploy, migrate:status) are in package.json; the root `pnpm db:*`
// scripts run them in every service.
const { defineConfig } = require('prisma/config');
const { loadEnv } = require('@pos-cafe/shared/env');

loadEnv(__dirname);

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Migrations may need a more privileged account than the running service: SALES_MIGRATION_DATABASE_URL wins when set.
    url: process.env.SALES_MIGRATION_DATABASE_URL || process.env.SALES_DATABASE_URL,
    shadowDatabaseUrl: process.env.SALES_SHADOW_DATABASE_URL,
  },
});
