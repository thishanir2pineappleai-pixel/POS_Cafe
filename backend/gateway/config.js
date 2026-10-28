const path = require('node:path');
const {
  loadEnv, parsePort, parseHost, parseOrigins, parseUrl, parsePositiveInt,
} = require('@pos-cafe/shared/env');

loadEnv(__dirname);

const AUTH = parseUrl('AUTH_SERVICE_URL', process.env.AUTH_SERVICE_URL, 'http://127.0.0.1:4001');
const SETTINGS = parseUrl('SETTINGS_SERVICE_URL', process.env.SETTINGS_SERVICE_URL, 'http://127.0.0.1:4002');
const STAFF = parseUrl('STAFF_SERVICE_URL', process.env.STAFF_SERVICE_URL, 'http://127.0.0.1:4003');
const MENU = parseUrl('MENU_SERVICE_URL', process.env.MENU_SERVICE_URL, 'http://127.0.0.1:4004');
const SALES = parseUrl('SALES_SERVICE_URL', process.env.SALES_SERVICE_URL, 'http://127.0.0.1:4005');

// The Gateway holds no secrets: it never verifies tokens (every service does that itself), it only routes.
// It listens on 4100 by default (GATEWAY_PORT); the frontend default API address (frontend/.env.example) points here.
const config = Object.freeze({
  port: parsePort(process.env.GATEWAY_PORT, 4100),
  host: parseHost(process.env.HOST),
  corsOrigins: parseOrigins(process.env.CORS_ORIGIN),
  upstreamTimeoutMs: parsePositiveInt('UPSTREAM_TIMEOUT_MS', process.env.UPSTREAM_TIMEOUT_MS, 15000),
  rateLimitPerMinute: parsePositiveInt('GATEWAY_RATE_LIMIT_PER_MINUTE', process.env.GATEWAY_RATE_LIMIT_PER_MINUTE, 600), // per client IP
  maxBodyBytes: parsePositiveInt('GATEWAY_MAX_BODY_BYTES', process.env.GATEWAY_MAX_BODY_BYTES, 10 * 1024 * 1024),
  // Each entry: the browser-facing route prefix and the internal service that owns it. The FIRST match wins, so a more
  // specific prefix must come before a general one (admin profiles are users, so /settings/admins belongs to the Auth Service).
  routes: [
    { prefix: '/api/v1/auth', name: 'auth-service', target: AUTH },
    { prefix: '/api/v1/settings/admins', name: 'auth-service', target: AUTH },
    { prefix: '/uploads/admins', name: 'auth-service', target: AUTH },
    { prefix: '/api/v1/settings', name: 'settings-service', target: SETTINGS },
    { prefix: '/uploads/settings', name: 'settings-service', target: SETTINGS },
    // Staff Management: staff, roles/permissions/teams, shifts and roster, attendance and leave, payroll.
    { prefix: '/api/v1/staff', name: 'staff-service', target: STAFF },
    { prefix: '/api/v1/permissions', name: 'staff-service', target: STAFF },
    { prefix: '/api/v1/roles', name: 'staff-service', target: STAFF },
    { prefix: '/api/v1/teams', name: 'staff-service', target: STAFF },
    { prefix: '/api/v1/shifts', name: 'staff-service', target: STAFF },
    { prefix: '/api/v1/attendance', name: 'staff-service', target: STAFF },
    { prefix: '/api/v1/payroll', name: 'staff-service', target: STAFF },
    // Sales: orders, discount applications, the sales summary and the Dashboard (computed from orders). /discounts/applications
    // MUST stay in front of /api/v1/discounts below, which belongs to the Menu Service (discount definitions).
    { prefix: '/api/v1/orders', name: 'sales-service', target: SALES },
    { prefix: '/api/v1/reports', name: 'sales-service', target: SALES },
    { prefix: '/api/v1/dashboard', name: 'sales-service', target: SALES },
    { prefix: '/api/v1/discounts/applications', name: 'sales-service', target: SALES },
    // Menu Management.
    { prefix: '/api/v1/products', name: 'menu-service', target: MENU },
    { prefix: '/api/v1/categories', name: 'menu-service', target: MENU },
    { prefix: '/api/v1/ingredients', name: 'menu-service', target: MENU },
    { prefix: '/api/v1/discounts', name: 'menu-service', target: MENU },
    { prefix: '/uploads/products', name: 'menu-service', target: MENU },
  ],
});

module.exports = { config };
