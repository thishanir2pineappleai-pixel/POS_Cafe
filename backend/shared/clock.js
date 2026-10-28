// The one place that reads the time for security rules (expiry, cooldowns, rate limits), so tests can move it.
// advance() and reset() are TEST HOOKS: production code never calls them.
let offsetMs = 0;

const now = () => Date.now() + offsetMs;
const advance = (ms) => { offsetMs += ms; };
const reset = () => { offsetMs = 0; };

module.exports = { now, advance, reset };
