# Sales Service (`@pos-cafe/sales-service`, port 4005, database `pos_sales_db`)

Owns **orders**, their lines, and **discount applications**, and computes the sales numbers that are derived from orders (the
Sales Management cards and the Dashboard). Plan and open decisions: `MIGRATION_PLAN_SALES_REPORTING.md` (repository root).

Every `/api/v1` route needs a signed-in user (`Authorization: Bearer <token>`); the Gateway forwards it unchanged and this
service verifies it and asks the Auth Service whether the session is still active (fails closed with 503). Everything is scoped
to the caller's **account**; orders also belong to a **shop** of that account (shops are asked from the Settings Service).
Products, prices and discount definitions are asked from the Menu Service over its internal API (`X-Internal-Key`); this service
never reads another service's database.

## API (through the Gateway: `http://127.0.0.1:4100`)

| Route | What it does |
|---|---|
| `GET /api/v1/orders?from&to&search&shopId&page&limit` | Orders, newest first. Dates `YYYY-MM-DD`, inclusive. Without `shopId` every shop of the account |
| `GET /api/v1/orders/export?...&format=csv` | Same filters, all rows, CSV (UTF-8 BOM, quoted cells, spreadsheet formulas neutralised). `pdf` and `xls` answer **501** |
| `POST /api/v1/orders` | Creates an order. Body: `{ type: "Take Away"\|"Dine-In", customerName?, tableLabel? (Dine-In only), shopId?, items: [{ productId, quantity }] }`. Prices, discounts, totals and status are **calculated here**; any such field in the body is ignored. 201, status `Pending` |
| `GET /api/v1/orders/:id` | One order with its lines |
| `PUT /api/v1/orders/:id` | Replaces type, customer, table and **all lines** (this is how items are added, changed or removed) and prices the order again. Only while the order is `Pending`, else 409 |
| `PATCH /api/v1/orders/:id/status` | Body `{ status }`. The barista's steps: `Pending -> Preparing -> Delivered` (BRD BR-04). Anything else is 409 (or 400 for `Paid`/`Cancelled`, with the reason) |
| `POST /api/v1/orders/:id/payments` | Body `{ method: "Cash" or "Card" }` (BRD BR-05). Only for a `Delivered` order; records ONE payment of exactly the order total and makes the order `Paid`, in one transaction. 201. A client-sent amount is ignored |
| `GET /api/v1/reports/sales/summary?from&to&shopId` | Total revenue (Cancelled excluded), total orders, new customers, peak hour |
| `GET /api/v1/dashboard/{summary,sales-trend,top-selling,order-status,recent-orders,stock}?date&period&shopId&limit` | The Dashboard, limited to ONE shop of the account (the requested one or the first). `stock` is the Menu Service's product stock |
| `GET/POST /api/v1/discounts/applications`, `GET/PUT/DELETE .../:id`, `PATCH .../:id/status` | Discount applications: a Menu discount definition applied over a period to all or selected products. Delete is **owner only** |

Errors always look like `{ success: false, code, message, errors? }` (400, 401, 403, 404, 409, 501, 503).

## Pricing rules (`services/order/pricing.js`)

Money is calculated in **whole cents** (`utils/money.js`), stored as `DECIMAL(10,2)` and never added as floating-point numbers.

| Rule | Status |
|---|---|
| Unit price = the product's Menu selling price when the order is saved; the line keeps a **copy** of name and price | Implemented |
| Line = quantity × unit price; subtotal = sum of lines; total = subtotal − discounts | Implemented |
| Daily offers are applied **automatically** to eligible items and the final amount is shown (BRD BR-09) | Confirmed by the BRD, implemented |
| An application is eligible when it is `Active`, its period includes the order date and it covers the product (or all products) | Implemented |
| When several applications are eligible for a line, the **largest percentage** is used (not stacked; lowest id wins a tie) | **Pending approval** |
| The product's own Menu discount is **not** applied | **Pending approval** |
| Rounding: half up to the cent, per line | **Pending approval** |
| Tax / service charge | **None**: no rate exists in any requirement |

## Order lifecycle

```text
Pending --(barista)--> Preparing --(barista)--> Delivered --(payment, cash or card)--> Paid
```

| Rule | Source |
|---|---|
| The barista marks orders "in progress" and "complete" | BRD BR-04 (confirmed) |
| Cash or card payment "upon order completion" | BRD BR-05 (confirmed) |
| "in progress" = `Preparing`, "complete" = `Delivered`, a Delivered order is the one that can be paid | **Inferred** from the status names in the designs: pending approval |
| A new order is `Pending`; only a `Pending` order can be edited | **Pending approval** |
| One full payment per order, amount = the order total (no partial, split or tip), recorded with who recorded it | **Pending approval** (BR-05 says nothing more) |
| Two requests racing for one step or one payment: exactly one wins, the other gets 409 | Implemented (guarded UPDATE + unique `payments.orderId`) |

The transition table is one object in `config/constants/orders.js`; change it there if the rules differ.

## Not implemented (no confirmed rules; nothing was invented)

- **Cancellation.** `Cancelled` exists in the designs, but no document says who may cancel, from which status, or what happens to
  a paid order. There is no cancel route (`PATCH .../status` with `Cancelled` answers 400); only orders that already have that status
  (the original data) are understood by the reports.
- **Refunds.** No refund rule, provider or document exists; no `refunds` table was created.
- **Payment providers, receipts, change calculation, SMS receipts** (BR-10).
- **Stock deduction when selling**, **customers** (the "new customers" metric needs a `customerId` nothing can set, so it is 0),
  **tables** (a Dine-In order carries a free-text `tableLabel`), **Peak Hour Analysis**, **PDF/XLS export**.
- **Roles.** The BRD names Cashier and Barista; the Auth Service only has `owner` and `admin`, so both may do everything here
  except delete a discount application (owner only, the plan's suggestion).

## Other unresolved decisions (pending approval)

1. Time zone of `placedAt`: stored as the server's local wall-clock time (`DATETIME(0)`, no conversion), as the original backend did.
2. Discount applications belong to the account, not a shop (the plan's proposal).
3. Sanity limits (no source): at most 100 lines per order, quantity 1-999, total below 100,000,000.
4. Order number format `#ORD<id>` (the original used sample numbers like `#VB-4829`).
5. Port 4005 and database name `pos_sales_db` (from the plan).
6. If a Menu product or discount is deleted later, saved orders and applications keep their copies; a deleted product id stays in an application's product list.
7. The lifecycle mapping and the one-full-payment rule above, and who may do each step (today: any `owner` or `admin` of the account; the BRD's Cashier and Barista roles do not exist in the Auth Service).

## Layout

```text
config/{env,constants}/          environment (shared helpers), order vocabulary, limits, messages
routes/v1/index.js               all routes (mounted at /api/v1 behind authenticate)
controllers/{order,reports,discount}/   HTTP in/out only
middleware/validation/           request validation (orders, discount applications)
services/{order,discount,analytics}/    business logic; integration/ = clients of Auth, Settings, Menu; shopScope.js
repositories/{memory,prisma}/    same methods and row shapes in both; index.js picks the driver
prisma/                          schema.prisma and migrations/ (20261022120000_init, 20261023090000_add_payments)
utils/                           money (cents) and text formatting
tests/{unit,integration,repository,persistence}
```

## Database (`pos_sales_db`)

Tables: `orders`, `order_items`, `payments`, `discount_applications`, `discount_application_products` (see `prisma/schema.prisma` and `backend/docs/DATABASE.md`).
Migrations, in order: `20261022120000_init` (orders, lines, discount applications) and `20261023090000_add_payments`. Never edit an applied one; add a new one.
Other services' ids (`accountId`, `shopId`, `productId`, `discountId`) are plain columns: **no foreign keys across databases**.
Foreign keys inside this database: `order_items → orders` and `discount_application_products → discount_applications`, both
`ON DELETE CASCADE`; `payments → orders` is `RESTRICT` (an order with a payment cannot be deleted) and `payments.orderId` is unique. Unique: `(shopId, orderNumber)`. Indexes serve the account/shop/date/status queries.

Safe setup order (nothing here runs automatically):

1. A MySQL administrator runs `backend/database/create-databases.sql` (creates `pos_sales_db`; the account statements are commented, set your own passwords): `pos_sales_migrate` (schema changes, Prisma CLI only) and `pos_sales_app` (runtime: SELECT/INSERT/UPDATE/DELETE only).
2. Put `REPOSITORY_DRIVER=prisma` and `SALES_DATABASE_URL=mysql://pos_sales_app:<password>@127.0.0.1:3306/pos_sales_db` in `backend/.env`, and `SALES_MIGRATION_DATABASE_URL=mysql://pos_sales_migrate:<password>@127.0.0.1:3306/pos_sales_db` in your shell for the migration commands.
3. `pnpm --filter @pos-cafe/sales-service db:generate` (needs no database).
4. `pnpm --filter @pos-cafe/sales-service db:migrate:status`, then `db:migrate:deploy` (applies the committed migration; never resets or drops).

To change the schema later: edit `schema.prisma`, run `db:migrate:dev --name <change>` against a **development** database (needs
`SALES_SHADOW_DATABASE_URL`), review the new folder under `prisma/migrations/`, commit it. Never edit an applied migration. Never use
`prisma db push` or `prisma migrate reset` on a database with data.

## Tests

`pnpm --filter @pos-cafe/sales-service test` runs everything in memory mode. The MySQL repository and restart-persistence tests run only
when `SALES_TEST_DATABASE_URL` points at a database whose name ends in `_test` (their tables are emptied); otherwise they are **skipped
and say so**.
