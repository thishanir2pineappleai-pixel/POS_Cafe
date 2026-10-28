// Errors every repository driver throws, so the services handle the in-memory and the MySQL driver the same way.
class DuplicateError extends Error {
  constructor(field) {
    super(`Duplicate ${field}`);
    this.duplicateField = field;
  }
}

module.exports = { DuplicateError };
