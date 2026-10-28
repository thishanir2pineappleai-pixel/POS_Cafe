-- POS Cafe: databases and accounts. NOTHING runs this automatically: a MySQL administrator runs it by hand.
--
-- ONE MySQL server, FIVE databases, one per service that owns data. A service never reads another service's database.
-- Never run this against a server that holds the Retail database (database_paipos) unless you have checked the names below do not
-- collide: every statement is CREATE ... IF NOT EXISTS and nothing here drops, alters or deletes anything.
--
-- TWO accounts per service (commented out: replace each CHANGE_ME privately before running, never commit a real password):
--   pos_<svc>_migrate  ADMINISTRATIVE/MIGRATION account: may CREATE/ALTER/DROP tables of its OWN database. Used ONLY by the Prisma
--                      CLI (db:migrate:deploy / db:migrate:dev) through <SVC>_MIGRATION_DATABASE_URL.
--   pos_<svc>_app      RUNTIME account: only SELECT, INSERT, UPDATE, DELETE on its own database. Used by the running service
--                      through <SVC>_DATABASE_URL. It cannot change the schema.
-- Neither account has any privilege outside its own database.
-- Apply each service's Prisma migrations separately (see the root README, "Database").

CREATE DATABASE IF NOT EXISTS pos_auth_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE USER IF NOT EXISTS 'pos_auth_migrate'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME';
-- GRANT ALL PRIVILEGES ON pos_auth_db.* TO 'pos_auth_migrate'@'127.0.0.1';
-- CREATE USER IF NOT EXISTS 'pos_auth_app'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON pos_auth_db.* TO 'pos_auth_app'@'127.0.0.1';

CREATE DATABASE IF NOT EXISTS pos_settings_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE USER IF NOT EXISTS 'pos_settings_migrate'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME';
-- GRANT ALL PRIVILEGES ON pos_settings_db.* TO 'pos_settings_migrate'@'127.0.0.1';
-- CREATE USER IF NOT EXISTS 'pos_settings_app'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON pos_settings_db.* TO 'pos_settings_app'@'127.0.0.1';

CREATE DATABASE IF NOT EXISTS pos_staff_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE USER IF NOT EXISTS 'pos_staff_migrate'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME';
-- GRANT ALL PRIVILEGES ON pos_staff_db.* TO 'pos_staff_migrate'@'127.0.0.1';
-- CREATE USER IF NOT EXISTS 'pos_staff_app'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON pos_staff_db.* TO 'pos_staff_app'@'127.0.0.1';

CREATE DATABASE IF NOT EXISTS pos_menu_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE USER IF NOT EXISTS 'pos_menu_migrate'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME';
-- GRANT ALL PRIVILEGES ON pos_menu_db.* TO 'pos_menu_migrate'@'127.0.0.1';
-- CREATE USER IF NOT EXISTS 'pos_menu_app'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON pos_menu_db.* TO 'pos_menu_app'@'127.0.0.1';

CREATE DATABASE IF NOT EXISTS pos_sales_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- CREATE USER IF NOT EXISTS 'pos_sales_migrate'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME';
-- GRANT ALL PRIVILEGES ON pos_sales_db.* TO 'pos_sales_migrate'@'127.0.0.1';
-- CREATE USER IF NOT EXISTS 'pos_sales_app'@'127.0.0.1' IDENTIFIED BY 'CHANGE_ME';
-- GRANT SELECT, INSERT, UPDATE, DELETE ON pos_sales_db.* TO 'pos_sales_app'@'127.0.0.1';

-- Shadow and isolated *_test databases are separate optional resources (names: pos_<svc>_db_shadow, pos_<svc>_db_test).
-- `prisma migrate dev` needs a shadow database and an account that may create databases; use a development server for that.
-- Repository and persistence tests EMPTY the tables of their *_test database, so they refuse any name that does not end in _test.
-- Never run repository tests on the application databases above.
