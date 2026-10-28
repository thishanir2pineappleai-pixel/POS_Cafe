// TEST SUPPORT: access to a MySQL TEST database for the repository and persistence tests.
// The tests EMPTY the tables they use, so they refuse to run against any database whose name does not end in _test.
// The URL comes from an environment variable (for example SETTINGS_TEST_DATABASE_URL); without it the database tests are
// skipped, and the skip is shown in the test output (never reported as a pass).
const { parseDatabaseUrl } = require('../env');

// Returns { url, connection } or null when the variable is not set.
function testDatabase(variableName) {
  const url = process.env[variableName];
  if (!url) return null;
  const connection = parseDatabaseUrl(variableName, url);
  if (!/_test$/.test(connection.database)) {
    throw new Error(`${variableName} points at database "${connection.database}": database tests only run against a database whose name ends in _test`);
  }
  return { url, connection };
}

module.exports = { testDatabase };
