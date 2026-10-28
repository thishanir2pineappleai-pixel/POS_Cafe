// Calls another service's /internal/* endpoints (service-to-service, never from the browser). Sends the shared
// X-Internal-Key and the caller's request id, gives up after timeoutMs, and FAILS CLOSED: anything but a clear 2xx answer
// (service down, timeout, wrong key, 5xx, unreadable body) is a 503 for the caller's client, never a guess.
// Returns the `data` of the success envelope.
const { ERROR_CODES, AppError } = require('./errors');
const { MESSAGES } = require('./messages');

// baseUrl may be a function so tests can point a service at a server that starts later.
function createInternalClient({ baseUrl, internalKey, timeoutMs = 3000 }) {
  const unavailable = () => new AppError(503, ERROR_CODES.SERVICE_UNAVAILABLE, MESSAGES.SERVICE_UNAVAILABLE);

  return async function call(method, path, { body, requestId } = {}) {
    let res;
    try {
      res = await fetch(`${typeof baseUrl === 'function' ? baseUrl() : baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json', 'x-internal-key': internalKey, ...(requestId ? { 'x-request-id': requestId } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw unavailable();
    }
    if (res.status < 200 || res.status > 299) throw unavailable();
    const json = await res.json().catch(() => null);
    if (!json || json.success !== true) throw unavailable();
    return json.data;
  };
}

module.exports = { createInternalClient };
