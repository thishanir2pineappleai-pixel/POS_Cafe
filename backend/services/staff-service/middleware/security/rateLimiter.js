// This service's rate limiter: counters live in the service store (in memory, per process).
const { createRateLimiter } = require('@pos-cafe/shared/rateLimiter');
const { store } = require('../../repositories/memory/store');

module.exports = createRateLimiter(store.rateLimits);
