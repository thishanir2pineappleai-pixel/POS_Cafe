// TEST SUPPORT: loaded before every test file with `node --test --import @pos-cafe/shared/testing/safeTestEnv.js ...`.
//
// A developer's real backend/.env is read by every service, including when the tests run (dotenv fills in whatever is not already
// set). Without this file, the tests would inherit whatever is kept there for local use, and that is dangerous:
//   * REPOSITORY_DRIVER=prisma + the real *_DATABASE_URL  -> the tests would read and WRITE the real application databases;
//   * MESSAGE_DELIVERY=smtp                               -> the tests could try to send real email;
//   * DEV_SKIP_PHONE_VERIFICATION=true                    -> the signup tests would follow a different flow.
// These are the safe defaults for tests. A test file that needs another value assigns it itself (process.env.X = ...) before it
// loads the service, and that assignment wins. The MySQL repository and persistence tests do exactly that, and only against a
// database whose name ends in _test (see shared/testing/database.js).
process.env.REPOSITORY_DRIVER ??= 'memory';
process.env.MESSAGE_DELIVERY ??= 'none';
process.env.DEV_SKIP_PHONE_VERIFICATION ??= 'false';
