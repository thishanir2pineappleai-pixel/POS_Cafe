# POS Cafe

A point-of-sale web application for cafés. A React frontend talks to an API Gateway, which routes to independent Express
microservices (each with its own Prisma schema and MySQL database). Structure and ownership: [FOLDER_STRUCTURE.md](FOLDER_STRUCTURE.md).

## Status

- **Backend services:** Auth, Settings, Staff and Menu come from the source project `POS_Cafe3`. The **Sales Service** is
  implemented here: orders (create, read, edit while Pending, list, CSV export), the barista steps Pending -> Preparing -> Delivered,
  cash/card payment of a Delivered order (-> Paid), discount applications, the sales summary and the Dashboard numbers, with its own
  Prisma schema and two migrations. There is **no Reporting Service**: reports are served by Sales.
- **Not built (no rules defined anywhere):** order cancellation, refunds, payment providers, tax, stock deduction, customers,
  tables, Cashier/Barista roles. See [backend/services/sales-service/README.md](backend/services/sales-service/README.md) for the confirmed and pending rules.
- **Frontend:** every built screen talks to the Gateway: sign-up (five steps and the access key), login, forgot/reset password,
  Dashboard, Staff list/add/details/edit, Menu (products, categories, ingredients, discount definitions, pictures), Sales (orders,
  summary, CSV export, discount applications) and Settings (shops and admins). Screens without a design remain placeholders:
  Staff Attendance, Payroll, Roles & Permission, Shift, Rewards, Deductions and Leave Management. The backend has endpoints for
  attendance, leave, payroll, roles, teams and shifts.
- **Verification (what was actually run):** `pnpm install --frozen-lockfile`, `pnpm check:architecture`, `pnpm db:generate`,
  `prisma validate`, all package tests with and without MySQL, the frontend build and a scripted run of the real screens.
  The MySQL runs used a **disposable** MySQL 8.0.45 instance on another port (`127.0.0.1:33306`), never your own server. The screens were driven
  in jsdom (a simulated browser), not in Chrome. Your own MySQL server has **not** been connected to: see "Setting up a real MySQL server" below.
- **Storage:** every service defaults to in-memory data (lost on restart). MySQL through Prisma is optional per service
  (`REPOSITORY_DRIVER=prisma`) and required when `NODE_ENV=production`.
- **Known limits:** Menu data (products, categories, ingredients, discount definitions) is shared by every account; sign-up codes and
  access keys are emailed only when you configure SMTP (`MESSAGE_DELIVERY=smtp`, see "Real email OTP" below; by default nothing is
  sent); **SMS is not available at all** (no provider), so the signup's phone step cannot be completed unless you use the
  local-development bypass `DEV_SKIP_PHONE_VERIFICATION=true`, which saves the phone as NOT verified;
  a new account has no roles, teams or shifts until the owner creates them (Staff Management offers a one-click starting set).
- **Open decisions** for Sales/Reporting: [MIGRATION_PLAN_SALES_REPORTING.md](MIGRATION_PLAN_SALES_REPORTING.md).

## Requirements

- Node.js 20.19+ or 22.12+
- pnpm 12 (`corepack enable`, or `npm i -g pnpm`)
- MySQL 8 only if you want persistent data

## Setup

```bash
pnpm install        # the lockfile lists every workspace package, the Sales Service included
```

Shared settings: copy `backend/.env.example` to `backend/.env` and set `JWT_SECRET` and `INTERNAL_SERVICE_KEY` (32+ random
characters, identical for every service):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Each service and the gateway also have an optional `.env.example` next to them. `.env` files are ignored by Git; never commit real values.

## Run

```bash
pnpm dev:services   # Gateway :4100, Auth :4001, Settings :4002, Staff :4003, Menu :4004, Sales :4005
pnpm dev:frontend   # UI :5173 (second terminal)
```

One service only: `pnpm dev:gateway`, `dev:auth`, `dev:settings`, `dev:staff`, `dev:menu`, `dev:sales`.
Health: `http://127.0.0.1:4100/health/services`. The frontend calls only the Gateway (`VITE_API_BASE_URL`, default `http://127.0.0.1:4100/api/v1`).
For production SPA routing, configure the web server to serve `index.html` as the fallback for frontend URLs so direct links and refreshes work.

## Database (optional)

One MySQL server, one database per service that owns data (`pos_auth_db`, `pos_settings_db`, `pos_staff_db`, `pos_menu_db`, `pos_sales_db`).
`backend/database/create-databases.sql` creates them (run it yourself as a MySQL administrator; replace the placeholder passwords first).
Tables, columns and relations: [backend/docs/DATABASE.md](backend/docs/DATABASE.md). Routes: [backend/docs/API.md](backend/docs/API.md).

**Two accounts per service** (commented in the script): `pos_<svc>_migrate` may change the schema of its own database and is used only by
the Prisma CLI through `<SVC>_MIGRATION_DATABASE_URL`; `pos_<svc>_app` has only SELECT/INSERT/UPDATE/DELETE and is what the running
service uses through `<SVC>_DATABASE_URL`. Neither can touch another database. Passwords go in your private `backend/.env` / shell, never in Git.

Set `REPOSITORY_DRIVER=prisma` and the `*_DATABASE_URL` values in `backend/.env`, then (the migration URLs are optional; without them the CLI uses `*_DATABASE_URL`):

```bash
pnpm db:generate          # generate the Prisma clients
pnpm db:migrate:status    # what is pending
pnpm db:migrate:deploy    # apply the committed migrations (never resets or drops)
```

Never use `prisma db push` or `prisma migrate reset` on a database that holds data. Never edit an applied migration: add a new one with
`pnpm --filter @pos-cafe/<svc>-service db:migrate:dev --name <change>` on a **development** database (needs `<SVC>_SHADOW_DATABASE_URL`), review it, commit it.
The Sales Service has two migrations: `20261022120000_init` and `20261023090000_add_payments`.

**MySQL 8 note:** a brand-new account logs in with `caching_sha2_password`, which needs the server's RSA key or TLS the first time. The services
allow the key fetch only when the database host is loopback (`127.0.0.1`/`localhost`); for a remote database use TLS, or log the account in once with the `mysql` client first.

### Setting up a real MySQL server (you run these; nothing here runs automatically)

Never point this project at the Retail database `database_paipos`. Use a MySQL administrator account for steps 1-2 only.

1. **Look first.** `SHOW DATABASES LIKE 'pos\_%';` If the five `pos_*_db` databases already exist (for example from the older `POS_Cafe3`
   project), do not recreate them: go to step 3. The Auth, Settings, Staff and Menu schemas and migrations in `POS_Cafe3` and here are
   byte-for-byte identical, so those four databases are compatible. Only the Sales database is new here.
2. **Create what is missing.** Copy `backend/database/create-databases.sql`, uncomment its `CREATE USER` / `GRANT` lines, replace every `CHANGE_ME`
   with your own password, and run it: `mysql -u <admin> -p < create-databases.sql`. It only uses `CREATE ... IF NOT EXISTS`.
   For tests also create `pos_<svc>_db_test` databases (the tests empty them) and give `pos_<svc>_app` DML rights there.
3. **Put the URLs in `backend/.env`** (git ignores it): `REPOSITORY_DRIVER=prisma`, `JWT_SECRET`, `INTERNAL_SERVICE_KEY`, `MENU_REQUIRE_AUTH=true`, the five
   `<SVC>_DATABASE_URL` values (restricted `_app` accounts) and, in your shell only, the `<SVC>_MIGRATION_DATABASE_URL` values (`_migrate` accounts).
4. **Check, then apply:** `pnpm db:generate`, then `pnpm db:migrate:status` (read what is pending), and only then `pnpm db:migrate:deploy`.
   `deploy` only applies the committed migrations; it never resets or drops. Do not use `prisma db push` or `prisma migrate reset` on a database with data.
   Do not let two copies of the project (this one and `POS_Cafe3`) run migrations against the same database at the same time.
5. **Run the database tests** with `<SVC>_TEST_DATABASE_URL` set to the `_test` databases, then `pnpm test`. Without them those tests are skipped and say so.

   `pnpm test` is safe to run while your `backend/.env` says `REPOSITORY_DRIVER=prisma` with real database URLs: every package's test
   script loads `shared/testing/safeTestEnv.js`, which makes the tests use the in-memory repositories, no real email and the normal
   phone step, whatever `.env` contains. If you run a test file directly with `node --test <file>`, add
   `--import @pos-cafe/shared/testing/safeTestEnv.js` (or set `REPOSITORY_DRIVER=memory`), otherwise it follows your `.env` and would write to the real databases.

## Real email OTP for local signup (SMTP)

Signup codes, the access key and password-reset codes are sent by email through any SMTP server (Gmail, your company's mail server...).
There is no SMS provider, so SMS stays **disabled**; for local development the phone step can be skipped explicitly.

**Configure** (the service refuses to start when a value is missing or invalid, and names the variable, never its value). Put these in
`backend/services/auth-service/.env` (read only by the Auth Service; ignored by Git) or in `backend/.env`:

| Variable | Meaning |
|---|---|
| `MESSAGE_DELIVERY=smtp` | send email by SMTP (default `none`; `dev-outbox` keeps messages in memory for tests only) |
| `SMTP_HOST`, `SMTP_PORT` | for example `smtp.gmail.com` and `587` (port 465 means TLS from the first byte) |
| `SMTP_SECURE` | `true` TLS from the start, `false` STARTTLS upgrade (default: `true` only for port 465). Plain text is never used off this machine |
| `SMTP_USER`, `SMTP_PASSWORD` | both or neither. Gmail: your address and an **app password** (2-Step Verification must be on), never the account password |
| `SMTP_FROM`, `SMTP_FROM_NAME` | sender address (Gmail only sends as the signed-in address) and display name (default `PAI POS`) |
| `SMTP_TIMEOUT_MS` | whole-send limit, default 10000; keep it below the Gateway's `UPSTREAM_TIMEOUT_MS` (15000) |
| `DEV_SKIP_PHONE_VERIFICATION=true` | **local development only**: skip the phone code. The phone is saved as *not verified* and the screen says so; the email code is still required. The Auth Service **refuses to start** with it when `NODE_ENV=production` |

**Test it for real** (this is the only way to know your SMTP account works; the automated tests never send real email):

1. Set the variables above, restart the Auth Service (`pnpm dev:services`) and look for `Message delivery: smtp. EMAIL is sent through ...` in its log.
2. Open the app, sign up with an address you can read, and watch step 2 ("Email verification"). If the mail server accepted the message there is
   no warning; otherwise the screen says the email could not be sent and the Auth log shows one line such as
   `[auth] email not sent: smtp_auth_failed (SMTP reply 535)` (never the code, the address or the password).
3. Enter the code from your inbox. After the business step the access key arrives by email too; enter it on the last screen, then log in.

Failure reasons: `smtp_auth_failed` (user/password, or Gmail needs an app password), `smtp_connection` (host/port/firewall), `smtp_tls`
(certificate rejected), `smtp_tls_required` (the server offers no STARTTLS), `smtp_timeout`, `smtp_recipient_rejected` (the address does not exist),
`smtp_sender_rejected` (`SMTP_FROM` is not allowed for this account), `smtp_temporary` (the server asked to retry later).
`delivered: true` means the SMTP server accepted the message; it cannot promise the inbox (check spam).

## Example: an order from start to finish (through the Gateway)

```bash
TOKEN=...   # from POST /api/v1/auth/login
curl -s -X POST http://127.0.0.1:4100/api/v1/orders -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"type":"Dine-In","tableLabel":"T4","items":[{"productId":1,"quantity":2}]}'          # priced from the Menu, status Pending
curl -s -X PATCH http://127.0.0.1:4100/api/v1/orders/1/status -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"status":"Preparing"}'
curl -s -X PATCH http://127.0.0.1:4100/api/v1/orders/1/status -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"status":"Delivered"}'
curl -s -X POST  http://127.0.0.1:4100/api/v1/orders/1/payments -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"method":"Cash"}'   # -> Paid
curl -s "http://127.0.0.1:4100/api/v1/orders/export?from=2026-10-01&to=2026-10-31" -H "Authorization: Bearer $TOKEN" -o sales-orders.csv
```

## Check

```bash
pnpm check:architecture   # static: package names, required service files, no imports that escape a service
pnpm test                 # all packages; MySQL tests are skipped unless a *_TEST_DATABASE_URL is set
pnpm build                # frontend production build
```

Test databases must have names ending in `_test`: the tests empty their tables.
