// Prisma CLI configuration of the Menu Service (generate, migrate). The connection URLs come from the environment
// (backend/.env or this service's .env), never from this file:
//   MENU_MIGRATION_DATABASE_URL (optional) same format, an account allowed to CREATE/ALTER tables; used ONLY by these CLI commands
//   MENU_DATABASE_URL         mysql://user:password@host:3306/pos_menu_db
//   MENU_SHADOW_DATABASE_URL  mysql://user:password@host:3306/pos_menu_db_shadow   (only `migrate dev` needs it)
const { defineConfig } = require('prisma/config');
const { loadEnv } = require('@pos-cafe/shared/env');

loadEnv(__dirname);

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // Migrations may need a more privileged account than the running service: MENU_MIGRATION_DATABASE_URL wins when set.
    url: process.env.MENU_MIGRATION_DATABASE_URL || process.env.MENU_DATABASE_URL,
    shadowDatabaseUrl: process.env.MENU_SHADOW_DATABASE_URL,
  },
});
