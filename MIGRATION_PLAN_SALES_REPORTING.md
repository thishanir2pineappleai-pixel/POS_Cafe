# Migration plan: Sales and Dashboard/Reporting to microservices, then retire the legacy backend

> **Status in this repository (POS_Cafe):** the original single backend (port 4000) is **not part of this project**. The Sales Service here now implements the original read features (orders list and CSV export, sales summary, discount applications, the Dashboard) plus order creation and editing of Pending orders, with its own Prisma schema and migration, **without** a separate Reporting Service (the plan's "alternative" in section 2: the Dashboard is computed from orders inside Sales; only the stock card is answered by the Menu Service). The barista steps (Pending -> Preparing -> Delivered, BRD BR-04) and cash/card payment of a Delivered order (BR-05) are implemented on that basis (inferred mapping, pending approval); cancellation, refunds and stock deduction (question 4) are still undefined and not built. Details: `backend/services/sales-service/README.md`. The retirement checklist (section 5) refers to the source project.

Status: **PLAN ONLY, nothing implemented yet.** Written from the current source code (legacy files under `backend/` read on
2026-10-20). Needs your answers to section 7 before Phase 1 starts.

## 1. What the legacy backend still does (inspected)

The microservices already replace the legacy auth, settings, staff and menu code (all four were migrated and tested earlier).
**No microservice, the Gateway or `shared/` imports anything from the legacy files** (checked: no `require` reaches outside its own package).
What is **only** in the legacy backend (port 4000, in-memory, no database):

| Legacy feature | Files | What really exists today | Needs auth today? |
|---|---|---|---|
| Order list `GET /orders` and CSV export `GET /orders/export` (`pdf` and `xls` answer 501) | `routes/v1/orderRoutes.js`, `controllers/order/orderController.js`, `services/order/orderService.js`, `repositories/memory/orderRepository.js`, `middleware/validation/orderValidation.js` | **Read-only.** There is **no way to create an order**: the in-memory collection is always empty at runtime, only tests insert rows. Every number is 0 | **No** |
| Sales summary `GET /reports/sales/summary` (total revenue, total orders, new customers, peak hour) | `controllers/reports/analyticsController.js`, `services/analytics/salesAnalyticsService.js` | Implemented on the empty collection | **No** |
| Discount applications `GET/POST /discounts/applications`, `GET/PUT/DELETE /discounts/applications/:id`, `PATCH .../:id/status` | `routes/v1/discountRoutes.js`, `controllers/payment/discountApplicationController.js`, `services/discount/discountApplicationService.js`, `repositories/memory/discountApplicationRepository.js` | Stores and returns applications (definition + period + all/selected products). **Calculates no price**; stacking with a product's own discount was never approved | **No** |
| Dashboard `GET /dashboard/{summary,sales-trend,top-selling,order-status,stock,recent-orders}` | `routes/v1/dashboardRoutes.js`, `controllers/reports/dashboardController.js`, `services/analytics/{sales,trend,inventory}AnalyticsService.js` | Implemented, **signed-in only**, limited to one shop of the caller's account; zeros on an empty collection. `stock` reports Menu **products** (there is no ingredient inventory) | Yes |
| Legacy tests of the above | `tests/integration/sales.test.js` (16), `dashboard.test.js` (13) | pass, but exercise the in-memory legacy code | n/a |

### What does **not** exist and cannot be "migrated" (must be built, or stays pending)

| Feature | Status |
|---|---|
| Creating, editing, paying, cancelling an order; status changes | **Does not exist.** Statuses are only a list (Paid, Preparing, Pending, Delivered, Cancelled); no transitions, no cashier, no table flow |
| Payments, receipts, invoices, refunds, tables/QR | Empty placeholder files only |
| Customers (new customers metric, "regular customers" screen) | No customer data model. The metric needs a `customerId` on orders that nothing sets |
| Peak Hour Analysis screen, PDF/XLS export, price calculation with discounts, stock deduction when selling | Not built / 501 / not approved |
| A real inventory (ingredient stock) | Not built; Dashboard "stock" shows Menu products |

**Consequence:** migrating Sales/Reporting means moving the *read and report* logic onto MySQL. A working order **workflow** is new
development (Phase 6) and I will not report it as "migrated".

## 2. Target architecture

```text
Browser -> Gateway :4100 -> auth :4001 | settings :4002 | staff :4003 | menu :4004
                         -> sales :4005      (NEW, database pos_sales_db)
                         -> reporting :4006  (NEW, no database: reads other services through internal APIs)
```

| Feature | Target | Why |
|---|---|---|
| Orders list/export, order creation (Phase 6), discount applications | **Sales Service** (`backend/services/sales-service`, `pos_sales_db`) | They are Sales' own data: orders, order lines, discount applications |
| Dashboard (6 endpoints) and `GET /reports/sales/summary` | **Reporting Service** (`backend/services/reporting-service`, stateless) | They combine **three** owners (orders from Sales, products/stock from Menu, shops from Settings) and own no data. Keeping them apart means a report problem cannot stop order taking |
| Product, shop, account lookups | Existing Menu, Settings, Auth services through new **internal** endpoints | Services never read each other's tables |

Alternative (smaller): put the dashboard inside the Sales Service. I recommend the separate stateless Reporting Service, but this is
your decision (question 1).

## 3. Database design: new `pos_sales_db` (not implemented; proposed)

Rules: MySQL + Prisma, one `init` migration created with `migrate dev` on a disposable database, then applied with `migrate deploy`.
Other services' data is referenced **by id only** (no cross-database keys).

| Table | Key columns | Notes |
|---|---|---|
| `orders` | `id` PK; `accountId`, `shopId` (references to Auth/Settings); `orderNumber` (unique per shop); `type` (take away / dine-in); `status`; `customerName`; `customerId` NULL (no customer table exists); `tableLabel` NULL; `total` DECIMAL(10,2); `placedAt`; `createdAt`, `updatedAt` | Indexes on (`shopId`,`placedAt`) and (`shopId`,`status`) for the dashboard |
| `order_items` | `id` PK; `orderId` FK -> `orders` (CASCADE); `productId` NULL (Menu reference, no key); `name` and `unitPrice` **copied at order time**; `quantity`; `position` | A later product edit or delete must not change old orders |
| `discount_applications` | `id` PK; `accountId`; `discountId`, `discountName`, `discountPercentage` (copied from Menu at save time); `startDate`, `endDate`; `status`; `appliesToAll`; timestamps | Copy is safe: Menu has no update/delete for discount definitions |
| `discount_application_products` | PK (`applicationId`,`productId`); `applicationId` FK (CASCADE); `productId` (Menu reference) | |

Open points: the time-storage convention (legacy uses local "YYYY-MM-DDTHH:mm:ss"; I will follow whatever the Staff service does),
and shop scope of discount applications (proposal: account level, like Menu today).

**No change** to the Auth, Settings, Staff or Menu schemas is needed for Phases 1-5. New *internal* endpoints are needed:

| Owner | New internal endpoint (needs `X-Internal-Key`, never routed by the Gateway) | Used by |
|---|---|---|
| Menu | product ids existence check; discount definition by id; stock overview; products by ids (name, category, image, price) | Sales (discount applications), Reporting (stock, top selling) |
| Sales | order rows or aggregates for an account, shop and date range | Reporting |
| Settings | `GET /internal/accounts/:accountId/shops` **already exists** | Sales, Reporting |

## 4. Phases (each ends with tests; I stop after each phase for your review)

| Phase | Work | Done when |
|---|---|---|
| **0** | You answer section 7 | decisions recorded |
| **1** | Sales Service skeleton in the same layout as the other four (config, shared auth, memory + Prisma repositories, `orders`/`order_items`, contract tests on both drivers, restart test), Prisma schema and migration, `create-databases.sql` gets `pos_sales_db` (+`_test`,`_shadow`), env example, scripts (`dev:sales`, included in `dev:services`) | contract tests pass on memory and on a **disposable** MySQL |
| **2** | Orders list and export over HTTP, signed-in, shop-checked through Settings; Gateway route `/api/v1/orders`; tests that seed orders through the repository (there is still no create API) | list/filter/search/paging/CSV match the old behaviour on the same fixtures |
| **3** | Discount applications (all 6 routes) in the Sales Service, validation against Menu through the new Menu internal endpoints; Gateway route `/api/v1/discounts/applications` **placed before** `/api/v1/discounts` | old test cases pass against the new service; persistence after restart |
| **4** | Reporting Service: 6 dashboard endpoints + sales summary, new Sales and Menu internal endpoints; Gateway routes `/api/v1/dashboard`, `/api/v1/reports` | same results as the legacy tests on the same fixtures; Reporting still answers (with a clear 503) if Sales is down |
| **5** | Frontend: fill `orderApi`, `salesApi`, `discountApi`, `dashboardApi`, `reportsApi` using `api/client.js` and the token; replace `salesMockData.js` and `dashboardMockData.js` in the Sales and Dashboard screens, with loading/empty/error states. Screens will honestly show **empty/zero** data until orders exist | frontend build passes; screens call only the Gateway |
| **6** | **Order creation workflow** (new feature, only after you approve its rules, section 7 Q4): create order from Menu products with the total **calculated on the server**, status transitions, permissions, tests | defined in the approved rules |
| **7** | **Retire the legacy backend** (checklist in section 5) | every check ticked |

## 5. Retirement checklist (nothing legacy is deleted before all of it is true)

1. Every route of section 1 exists in a service, with tests passing against the new service.
2. `grep` finds no frontend, Gateway, script, test or doc reference to port 4000 or to legacy paths.
3. The Gateway has no route to the legacy backend (it never had one).
4. `pnpm test` and the frontend build pass, with the database tests also passing on a disposable MySQL.
5. Files with **your uncommitted work or intentional keepers** are handled explicitly, not deleted with the folder:
   - `backend/services/user/shiftService.js` (your uncommitted `buildRow` duplicate; backup in `D:\Internship\POS_Cafe3_backups\phase1-20261019-111928`),
   - the Redis / Bull / cache / queue placeholder folders (you asked to keep them; they currently live inside the legacy tree),
   - `backend/uploads/` (uploaded files), `backend/database/create-databases.sql`, `backend/docs/`.
6. If any item is incomplete the legacy code **stays** and the report says what remains.

## 6. Risks

| Risk | Mitigation |
|---|---|
| Orders cannot be created, so Sales and Dashboard show zeros even after migration | Said plainly in every report; Phase 6 is separate |
| Legacy Sales endpoints are **unauthenticated**; requiring sign-in changes behaviour | Intentional security fix; needs your OK (Q2) |
| Menu data is global (no shop or account), but orders are per account and shop | Order lines copy name and price; the shop-scope decision for Menu is still open and should be made before real data |
| Dashboard performance if Reporting pulls order rows from Sales | Fine at café scale; Sales aggregates endpoint later if needed |
| Two services between a dashboard click and the data (Reporting -> Sales/Menu/Settings) | Timeouts and fail-closed 503 as in the existing internal calls |
| Deleting the legacy tree removes user files or kept placeholders | Section 5, item 5 |
| Real MySQL is still not set up (my earlier request to you) | Database verification stays on a disposable MySQL until you create the databases |

## 7. Decisions I need from you

1. **Reporting**: separate stateless Reporting Service (recommended) or inside the Sales Service?
2. **Authentication**: require sign-in on all Sales/Reporting routes (legacy Sales routes had none). Suggested: Owner and Admin can view and edit; deleting a discount application is Owner only. OK?
3. **Scope**: orders and discount applications carry `accountId` (and orders `shopId`); Menu stays global until its own scope decision. OK?
4. **Order creation**: do you want Phase 6 now? If yes I need the rules: allowed status transitions, who may create or cancel, how the total is calculated (including whether a Menu discount or a discount application is applied), whether stock is deducted, and whether payment is recorded (I would not store card data at all).
5. **Ports**: Sales 4005 and Reporting 4006; the Gateway moves to 4000 when the legacy backend is retired.
6. **At retirement**: where should the kept placeholder folders and `shiftService.js` go (suggested: a `backend/_kept/` folder, untouched)?
