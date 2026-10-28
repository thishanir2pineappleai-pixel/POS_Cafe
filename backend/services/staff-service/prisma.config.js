// Prisma CLI configuration of the Staff Service (generate, migrate). The connection URLs come from the environment
// (backend/.env or this service's .env), never from this file:
//   STAFF_MIGRATION_DATABASE_URL (optional) same format, an account allowed to CREATE/ALTER tables; used ONLY by these CLI commands
//   STAFF_DATABASE_URL         mysql://user:password@host:3306/pos_staff_db
//   STAFF_SHADOW_DATABASE_URL  mysql://user:password@host:3306/pos_staff_db_shadow   (only `migrate dev` needs it)
const { defineConfig } = require('prisma/config');
const { loadEnv } = require('@pos-cafe/shared/env');

loadEnv(__dirname);

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Migrations may need a more privileged account than the running service: STAFF_MIGRATION_DATABASE_URL wins when set.
    url: process.env.STAFF_MIGRATION_DATABASE_URL || process.env.STAFF_DATABASE_URL,
    shadowDatabaseUrl: process.env.STAFF_SHADOW_DATABASE_URL,
  },
});
