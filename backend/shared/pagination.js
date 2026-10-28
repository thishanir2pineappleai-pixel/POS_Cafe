const { toInt } = require('./validator');

// PENDING APPROVAL: default and maximum page size (the UI shows 9 rows per page).
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

// Reads ?page= and ?limit=; returns { page, limit, errors }.
function parsePagination(query) {
  const errors = [];
  let page = 1;
  let limit = DEFAULT_LIMIT;
  if (query.page !== undefined) {
    page = toInt(query.page, { min: 1 });
    if (page === null) { errors.push({ field: 'page', message: 'Must be a whole number from 1' }); page = 1; }
  }
  if (query.limit !== undefined) {
    limit = toInt(query.limit, { min: 1, max: MAX_LIMIT });
    if (limit === null) { errors.push({ field: 'limit', message: `Must be a whole number from 1 to ${MAX_LIMIT}` }); limit = DEFAULT_LIMIT; }
  }
  return { page, limit, errors };
}

const buildMeta = (total, page, limit) => ({ total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });

module.exports = { DEFAULT_LIMIT, MAX_LIMIT, parsePagination, buildMeta };
