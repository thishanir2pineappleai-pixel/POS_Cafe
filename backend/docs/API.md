# API reference (routes)

Generated from the route files. Everything is called **through the Gateway** at `http://127.0.0.1:4100` (the services listen on
loopback ports only). Responses are `{ "success": true, "data": ..., "meta"?: ... }`; errors are `{ "success": false, "code": "...", "message": "...", "errors"?: [...] }`.
Authenticated routes need `Authorization: Bearer <token>` from `POST /api/v1/auth/login`. `/internal/*` routes need the shared `X-Internal-Key`
and are **never** routed by the Gateway. Request/response details and business rules are in each service's own README and in `backend/services/*/middleware/validation`.


## Auth Service (:4001)

| Method | Path |
|---|---|
| POST | `/api/v1/auth/login` |
| POST | `/api/v1/auth/logout` |
| GET | `/api/v1/auth/me` |
| POST | `/api/v1/auth/signup/credentials` |
| POST | `/api/v1/auth/signup/email/verify` |
| POST | `/api/v1/auth/signup/email/resend` |
| POST | `/api/v1/auth/signup/owner` |
| POST | `/api/v1/auth/signup/phone/verify` |
| POST | `/api/v1/auth/signup/phone/resend` |
| POST | `/api/v1/auth/signup/business` |
| POST | `/api/v1/auth/signup/activate` |
| POST | `/api/v1/auth/signup/access-key/resend` |
| POST | `/api/v1/auth/forgot-password` |
| POST | `/api/v1/auth/forgot-password/verify` |
| POST | `/api/v1/auth/reset-password` |
| GET | `/api/v1/settings/admins` |
| POST | `/api/v1/settings/admins` |
| GET | `/api/v1/settings/admins/:id` |
| PUT | `/api/v1/settings/admins/:id` |
| PUT | `/api/v1/settings/admins/:id/password` |
| POST | `/api/v1/settings/admins/:id/image` |
| POST | `/internal/sessions/verify` |
| GET | `/health` (no sign-in) |

## Settings Service (:4002)

| Method | Path |
|---|---|
| GET | `/api/v1/settings/timezones` |
| GET | `/api/v1/settings/shops` |
| POST | `/api/v1/settings/shops` |
| GET | `/api/v1/settings/shops/:id` |
| PUT | `/api/v1/settings/shops/:id` |
| POST | `/api/v1/settings/shops/:id/image` |
| GET | `/internal/accounts/:accountId/shops` |
| PUT | `/internal/accounts/:accountId/first-shop` |
| GET | `/health` (no sign-in) |

## Staff Service (:4003)

| Method | Path |
|---|---|
| GET | `/api/v1/staff/summary` |
| GET | `/api/v1/staff` |
| POST | `/api/v1/staff` |
| GET | `/api/v1/staff/:id` |
| PATCH | `/api/v1/staff/:id` |
| PUT | `/api/v1/staff/:id/status` |
| DELETE | `/api/v1/staff/:id` |
| POST | `/api/v1/staff/:id/restore` |
| GET | `/api/v1/staff/:id/image` |
| POST | `/api/v1/staff/:id/image` |
| POST | `/api/v1/staff/:id/documents/:slot` |
| GET | `/api/v1/staff/:id/documents/:slot` |
| GET | `/api/v1/shifts/roster` |
| GET | `/api/v1/shifts/roster/export` |
| PUT | `/api/v1/shifts/roster/:staffId` |
| DELETE | `/api/v1/shifts/roster/:staffId` |
| GET | `/api/v1/shifts` |
| POST | `/api/v1/shifts` |
| PUT | `/api/v1/shifts/:id` |
| PUT | `/api/v1/shifts/:id/status` |
| DELETE | `/api/v1/shifts/:id` |
| GET | `/api/v1/attendance` |
| GET | `/api/v1/attendance/summary` |
| GET | `/api/v1/attendance/export` |
| POST | `/api/v1/attendance/check-in` |
| POST | `/api/v1/attendance/check-out` |
| GET | `/api/v1/attendance/leaves` |
| GET | `/api/v1/attendance/leaves/summary` |
| GET | `/api/v1/attendance/leaves/export` |
| POST | `/api/v1/attendance/leaves` |
| GET | `/api/v1/attendance/leaves/:id` |
| PUT | `/api/v1/attendance/leaves/:id` |
| DELETE | `/api/v1/attendance/leaves/:id` |
| GET | `/api/v1/attendance/staff/:staffId` |
| GET | `/api/v1/payroll/summary` |
| GET | `/api/v1/payroll/overview` |
| GET | `/api/v1/payroll/records` |
| GET | `/api/v1/payroll/records/export` |
| POST | `/api/v1/payroll/records` |
| GET | `/api/v1/payroll/records/:id` |
| PUT | `/api/v1/payroll/records/:id` |
| POST | `/api/v1/payroll/records/:id/pay` |
| GET | `/api/v1/permissions` |
| GET | `/api/v1/roles` |
| POST | `/api/v1/roles` |
| GET | `/api/v1/roles/:id` |
| PUT | `/api/v1/roles/:id` |
| DELETE | `/api/v1/roles/:id` |
| PUT | `/api/v1/roles/:id/permissions` |
| GET | `/api/v1/teams` |
| POST | `/api/v1/teams` |
| GET | `/api/v1/teams/:id` |
| PUT | `/api/v1/teams/:id` |
| DELETE | `/api/v1/teams/:id` |
| GET | `/health` (no sign-in) |

## Menu Service (:4004)

| Method | Path |
|---|---|
| GET | `/api/v1/products` |
| GET | `/api/v1/products/summary` |
| GET | `/api/v1/products/:id` |
| POST | `/api/v1/products` |
| PUT | `/api/v1/products/:id` |
| DELETE | `/api/v1/products/:id` |
| PATCH | `/api/v1/products/:id/ingredients/:ingredientId` |
| POST | `/api/v1/products/:id/image` |
| GET | `/api/v1/categories` |
| POST | `/api/v1/categories` |
| GET | `/api/v1/ingredients` |
| POST | `/api/v1/ingredients` |
| GET | `/api/v1/discounts` |
| POST | `/api/v1/discounts` |
| POST | `/internal/products/lookup` |
| POST | `/internal/discounts/lookup` |
| GET | `/internal/stock-overview` |
| GET | `/health` (no sign-in) |

## Sales Service (:4005)

| Method | Path |
|---|---|
| GET | `/api/v1/orders` |
| GET | `/api/v1/orders/export` |
| POST | `/api/v1/orders` |
| GET | `/api/v1/orders/:id` |
| PUT | `/api/v1/orders/:id` |
| PATCH | `/api/v1/orders/:id/status` |
| POST | `/api/v1/orders/:id/payments` |
| GET | `/api/v1/reports/sales/summary` |
| GET | `/api/v1/dashboard/summary` |
| GET | `/api/v1/dashboard/sales-trend` |
| GET | `/api/v1/dashboard/top-selling` |
| GET | `/api/v1/dashboard/order-status` |
| GET | `/api/v1/dashboard/stock` |
| GET | `/api/v1/dashboard/recent-orders` |
| GET | `/api/v1/discounts/applications` |
| POST | `/api/v1/discounts/applications` |
| GET | `/api/v1/discounts/applications/:id` |
| PUT | `/api/v1/discounts/applications/:id` |
| PATCH | `/api/v1/discounts/applications/:id/status` |
| DELETE | `/api/v1/discounts/applications/:id` |
| GET | `/health` (no sign-in) |
