# POS Cafe: folder structure

The project has two parts: the **frontend** and a **microservices backend** (API Gateway, shared library, five services).
There is no separate monolithic backend. Excluded from the trees below: `node_modules/`, `generated/` (Prisma clients, created by
`pnpm db:generate`), `uploads/` (runtime files), the contents of `prisma/migrations/` and `tests/`, and the page/component files of the frontend.

```text
POS_Cafe/
├── package.json  pnpm-workspace.yaml  pnpm-lock.yaml  .gitignore  README.md  FOLDER_STRUCTURE.md
├── MIGRATION_PLAN_SALES_REPORTING.md        plan and open decisions for Sales and Reporting
├── scripts/check-architecture.cjs           static check of the service boundaries (pnpm check:architecture)
│
├── frontend/                                React + Vite UI              :5173
│   ├── package.json  index.html  vite.config.js  .env.example  public/
│   └── src/  App.jsx  main.jsx  index.css
│       ├── api/  utils/  components/  pages/  Gateway calls, shared formatting helpers, shared UI, screen folders
│       └── context/  hooks/  layout/  routes/  stepper/  validation/  assets/
│   └── tests/                               logic tests (request client, staff form <-> API mapper): pnpm --filter @pos-cafe/frontend test
│
└── backend/
    ├── package.json                         workspace folder only (no code)
    ├── .env.example                         shared settings (JWT_SECRET, INTERNAL_SERVICE_KEY, database URLs)
    ├── database/create-databases.sql        creates the databases; run by you as a MySQL administrator
    ├── docs/                                API documentation (docx, html) and the staff schema note
    ├── gateway/                             API Gateway                  :4100
    ├── shared/                              code used by every service
    └── services/
        ├── auth-service/                    :4001   pos_auth_db
        ├── settings-service/                :4002   pos_settings_db
        ├── staff-service/                   :4003   pos_staff_db
        ├── menu-service/                    :4004   pos_menu_db
        └── sales-service/                   :4005   pos_sales_db
```

Page folders and React component files: PascalCase. Other JS files and non-page folders: camelCase/lowercase.

## Service layout

Every service has the same layout and uses only `@pos-cafe/shared` (never another service's code):

```text
<service>/
├── package.json  .env.example  app.js  server.js  prisma.config.js
├── config/{env,constants}/                  environment parsing and constants
├── routes/v1/  controllers/  middleware/  services/
├── repositories/{memory,prisma}/            index.js picks the driver from REPOSITORY_DRIVER
├── prisma/{schema.prisma,migrations/}       this service's own schema and migrations
└── tests/{integration,repository,persistence}/   (auth-service and sales-service also have unit/)
```

Notes:
- `sales-service` also has `services/{order,discount,analytics}/`, `services/integration/` (clients of Auth, Settings and Menu) and `utils/` (money in cents); see its README.
- `backend/docs/` has DATABASE.md and API.md (generated from the schemas and route files), the API Word/HTML documents and the staff schema note.
- `menu-service` also has `routes/internalRoutes.js`: the read-only lookups the Sales Service calls (`X-Internal-Key`, never routed by the Gateway).
- `auth-service` and `settings-service` also have `routes/internalRoutes.js`: service-to-service endpoints protected by `INTERNAL_SERVICE_KEY`.
- `auth-service/services/integration/` holds the delivery boundary: `emailProvider.js` (none / dev-outbox / SMTP), `smtpTransport.js` (the SMTP client, built on
  Node's `net` and `tls`, no mail library) and `smsProvider.js` (always "not configured"). `shared/testing/` also has `fakeSmtpServer.js` and `safeTestEnv.js` (see the README, "Real email OTP").
- Some services have extra folders where their code needs them (`services/integration`, `services/storage`, `utils`).

## What each part owns

| Package | Owns |
|---|---|
| `@pos-cafe/gateway` | Routing by URL prefix, request ids, CORS, per-IP rate limit, body cap, upstream timeouts, common errors. No business logic, no secrets |
| `@pos-cafe/shared` | Domain-independent code: env parsing, JWT, password hashing, authenticate/authorize middleware, responses and errors, validation, pagination, CSV, dates, uploads, test helpers |
| `@pos-cafe/auth-service` | Accounts, login users (owner and admin profiles), sessions, signup, one-time codes, password recovery, JWT signing, admin pictures, `/internal/sessions/verify` |
| `@pos-cafe/settings-service` | Shop profiles, timezones, shop logos, `/internal` shop lookups |
| `@pos-cafe/staff-service` | Staff, roles and permissions, teams, shifts and roster, attendance and leave, payroll, private staff pictures and documents |
| `@pos-cafe/menu-service` | Products, categories, ingredients, discount **definitions**, product photos |
| `@pos-cafe/sales-service` | Orders (create, read, edit while Pending, list, CSV export), the barista steps Pending -> Preparing -> Delivered, cash/card payment (-> Paid), discount **applications**, the sales summary and the Dashboard numbers. No cancellation or refunds (rules not defined) |

## Gateway routes (`backend/gateway/config.js`)

| Prefix | Service |
|---|---|
| `/api/v1/auth`, `/api/v1/settings/admins`, `/uploads/admins` | auth-service |
| `/api/v1/settings`, `/uploads/settings` | settings-service |
| `/api/v1/staff`, `/permissions`, `/roles`, `/teams`, `/shifts`, `/attendance`, `/payroll` | staff-service |
| `/api/v1/products`, `/categories`, `/ingredients`, `/discounts`, `/uploads/products` | menu-service |
| `/api/v1/orders`, `/api/v1/reports`, `/api/v1/dashboard`, `/api/v1/discounts/applications` | sales-service (the last one is listed BEFORE `/api/v1/discounts`, which is menu-service) |

## Where the original backend's Sales and Dashboard features went

There is no Reporting Service. The original (single) backend's remaining features live in the Sales Service:

| Original feature | Now |
|---|---|
| Order list and CSV export | `GET /api/v1/orders`, `/orders/export` (sign-in and account scoping added; `pdf`/`xls` still 501) |
| Sales summary | `GET /api/v1/reports/sales/summary` |
| Discount applications (6 routes) | `/api/v1/discounts/applications...`, definitions and products checked through the Menu Service |
| Dashboard summary, sales trend, top selling, order status, recent orders | `/api/v1/dashboard/...`, computed from orders |
| Dashboard stock | `/api/v1/dashboard/stock`, answered by the Menu Service through its internal API (Menu products; there is no ingredient inventory) |
| Order creation | New (the original backend had none): see the Sales Service README for the confirmed and the pending rules |

Not built because no rules exist: order cancellation, refunds, payment providers, stock deduction, customers, tables. Tables and routes of every service: `backend/docs/DATABASE.md` and `backend/docs/API.md`.

The frontend's `src/api/` now has one module per backend area (auth, orders, sales/discount applications, reports, dashboard, products,
categories, ingredients, discounts, staff, shops, admins, settings) on top of `client.js`, which attaches the session token and ends the
session on a 401. The empty staff API placeholders are `attendanceApi`, `payrollApi`, `payrollRewardApi`, `payrollDeductionApi` and `shiftApi`; the Staff Service endpoints exist. Staff Attendance, Payroll, Roles & Permission, Shift, Rewards and Deductions screens, their staff validation files, and `routes/ProtectedRoute.jsx` are also placeholders marked with TODO comments.

`pages/StaffManagement/LeaveManagement.jsx` is also a placeholder for the Staff Service's leave, half-day leave and hour permission records.
