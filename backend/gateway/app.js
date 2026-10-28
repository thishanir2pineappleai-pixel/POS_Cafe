// The API Gateway: the one entry point of the frontend. It routes by URL prefix to the internal services and adds only
// cross-cutting things: CORS, request ids, a per-IP rate limit, an upload size cap, upstream timeouts and consistent
// errors. It contains NO business logic and does NOT authorize anything: every service verifies tokens itself.
const express = require('express');
const cors = require('cors');
const { createProxyMiddleware, proxyEventsPlugin } = require('http-proxy-middleware');
const requestId = require('@pos-cafe/shared/middleware/requestId');
const notFound = require('@pos-cafe/shared/middleware/notFound');
const errorHandler = require('@pos-cafe/shared/middleware/errorHandler');
const { createRateLimiter } = require('@pos-cafe/shared/rateLimiter');
const { sendSuccess } = require('@pos-cafe/shared/responses');
const { sendError, ERROR_CODES, AppError } = require('@pos-cafe/shared/errors');
const { MESSAGES } = require('@pos-cafe/shared/messages');

// Answers a failed upstream call with the standard error envelope: 504 when it was too slow, 503 when it is unreachable.
// The proxy reports its own timeout as a plain ECONNRESET ("socket hang up"), so a reset that happened after the whole
// timeout had passed counts as a timeout; a quicker reset (the service crashed or closed the connection) is a 503.
function upstreamError(err, req, res, timeoutMs) {
  if (!res || typeof res.writeHead !== 'function' || res.headersSent) { res?.destroy?.(); return; }
  const slow = Date.now() - req.upstreamStartedAt >= timeoutMs - 50;
  if (slow) sendError(res, 504, ERROR_CODES.GATEWAY_TIMEOUT, MESSAGES.GATEWAY_TIMEOUT);
  else sendError(res, 503, ERROR_CODES.SERVICE_UNAVAILABLE, MESSAGES.SERVICE_UNAVAILABLE);
}

function proxyTo({ prefix, target }, { upstreamTimeoutMs }) {
  return createProxyMiddleware({
    target,
    // Mounted at the root so the full path reaches the service unchanged. Matches the prefix on a path boundary only
    // ("/api/v1/auth" and "/api/v1/auth/...", never "/api/v1/auth-evil").
    pathFilter: (pathname) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    changeOrigin: false,
    xfwd: true,
    proxyTimeout: upstreamTimeoutMs, // how long the service may take to answer
    ejectPlugins: true, // the default plugins answer errors in plain text and log; only the event hooks are kept
    plugins: [proxyEventsPlugin],
    on: {
      proxyReq: (proxyReq, req) => {
        req.upstreamStartedAt = Date.now();
        proxyReq.setHeader('x-request-id', req.id);
        proxyReq.setHeader('x-forwarded-for', req.socket.remoteAddress); // the Gateway is the edge: a client-sent value is never trusted
        proxyReq.removeHeader('x-internal-key'); // the internal key is for service-to-service calls only
      },
      error: (err, req, res) => upstreamError(err, req, res, upstreamTimeoutMs),
    },
  });
}

// config: see config.js (the tests pass their own, pointing at test servers).
function createApp(config) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestId);
  app.use(cors({ origin: config.corsOrigins, exposedHeaders: ['X-Request-Id', 'Retry-After'] }));

  const { rateLimit, byIp } = createRateLimiter(new Map());
  app.use(rateLimit({ name: 'gateway', windowMs: 60 * 1000, max: config.rateLimitPerMinute, key: byIp }));

  app.get('/health', (req, res) => sendSuccess(res, { data: { service: 'gateway', status: 'ok' } }));
  // Asks every routed service for its /health, so one call shows what is up (never forwards a client request).
  app.get('/health/services', async (req, res) => {
    const services = {};
    const distinct = [...new Map(config.routes.map((r) => [r.name, r])).values()];
    await Promise.all(distinct.map(async (route) => {
      try {
        const r = await fetch(`${route.target}/health`, { signal: AbortSignal.timeout(2000) });
        services[route.name] = r.ok ? 'ok' : 'unhealthy';
      } catch {
        services[route.name] = 'unreachable';
      }
    }));
    const up = Object.values(services).every((s) => s === 'ok');
    sendSuccess(res, { status: up ? 200 : 503, data: { gateway: 'ok', services } });
  });

  // Uploads are streamed to the owning service; this only refuses obviously oversized bodies early.
  app.use((req, res, next) => (Number(req.get('content-length')) > config.maxBodyBytes
    ? next(new AppError(413, ERROR_CODES.VALIDATION_ERROR, MESSAGES.PAYLOAD_TOO_LARGE))
    : next()));

  for (const route of config.routes) app.use(proxyTo(route, config));

  app.use(notFound); // includes /internal/*: service-to-service endpoints are never reachable through the Gateway
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
