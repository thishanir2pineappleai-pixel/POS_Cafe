# Database design

Generated from the five `prisma/schema.prisma` files (it lists exactly what the migrations create). One MySQL server, **five databases**,
one per service; a service never reads another service's database, so ids that point at another service (`accountId`, `shopId`,
`productId`, `discountId`, `userId` ...) are **plain columns without foreign keys**. Money is `DECIMAL`, never floating point.
All timestamps are `DATETIME(3)` (UTC from the driver) unless a column says otherwise; calendar dates are `DATE`.

| Service | Database | Tables | Migrations (in order) |
|---|---|---|---|
| Auth Service (:4001) | `pos_auth_db` | 5 | `20261019144420_init` |
| Settings Service (:4002) | `pos_settings_db` | 1 | `20261019141107_init` |
| Staff Service (:4003) | `pos_staff_db` | 11 | `20261019153104_init` |
| Menu Service (:4004) | `pos_menu_db` | 5 | `20261019142754_init` |
| Sales Service (:4005) | `pos_sales_db` | 5 | `20261022120000_init`, `20261023090000_add_payments` |

## Auth Service: `pos_auth_db`

### `accounts` (model Account)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |

### `users` (model User)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `accountId` | Int |  |  |
| `role` | VarChar(10) |  | owner | admin, set by the server only |
| `status` | VarChar(20) |  | active | disabled |
| `username` | VarChar(50) NULL |  | only users created by signup |
| `firstName` | VarChar(100) |  |  |
| `lastName` | VarChar(100) |  |  |
| `phone` | VarChar(255) |  | signup does not cap the length of the typed phone text |
| `phoneNormalized` | VarChar(20) |  |  |
| `email` | VarChar(254) | unique |  |
| `passwordHash` | VarChar(255) |  |  |
| `imagePath` | VarChar(60) NULL |  | generated <uuid>.png|jpg file name, never a path |
| `emailVerifiedAt` | BigInt NULL |  |  |
| `phoneVerifiedAt` | BigInt NULL |  |  |
| `lastLoginAt` | BigInt NULL |  |  |
| `createdAt` | DateTime(3) | default now |  |
| `updatedAt` | DateTime(3) | auto-updated |  |

Indexes: (accountId), (phoneNormalized)  
Foreign key `accountId` -> `Account.id` (on delete: default)

### `sessions` (model Session)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `sid` | VarChar(36) | PK |  |
| `userId` | Int |  |  |
| `accountId` | Int |  |  |
| `expiresAt` | BigInt |  |  |
| `createdAt` | BigInt |  |  |
| `revokedAt` | BigInt NULL |  |  |

Indexes: (userId)  
Foreign key `userId` -> `User.id` (on delete: default)

### `one_time_codes` (model OneTimeCode)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `purpose` | VarChar(30) |  |  |
| `subject` | VarChar(64) |  |  |
| `hash` | VarChar(64) |  |  |
| `expiresAt` | BigInt |  |  |
| `attempts` | Int | default 0 |  |
| `usedAt` | BigInt NULL |  |  |
| `invalidatedAt` | BigInt NULL |  |  |
| `createdAt` | BigInt |  |  |

Indexes: (purpose, subject), (purpose, hash)

### `registrations` (model Registration)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `tokenHash` | VarChar(64) NULL | unique | NULL after activation |
| `tokenExpiresAt` | BigInt |  |  |
| `email` | VarChar(254) |  |  |
| `username` | VarChar(50) |  |  |
| `passwordHash` | VarChar(255) NULL |  | NULL after activation |
| `termsAcceptedAt` | BigInt |  |  |
| `status` | VarChar(30) |  | email_pending ... awaiting_activation | activated |
| `emailVerifiedAt` | BigInt NULL |  |  |
| `phoneVerifiedAt` | BigInt NULL |  |  |
| `createdAt` | BigInt |  |  |
| `ownerName` | VarChar(100) NULL |  |  |
| `phone` | VarChar(255) NULL |  |  |
| `phoneNormalized` | VarChar(20) NULL |  |  |
| `businessName` | VarChar(150) NULL |  |  |
| `address` | VarChar(255) NULL |  |  |
| `accessKeyHash` | VarChar(255) NULL |  | NULL after activation |
| `accessKeyExpiresAt` | BigInt NULL |  |  |
| `accessKeyAttempts` | Int | default 0 |  |
| `accessKeySends` | Json NULL |  | [epoch ms, ...] of the access keys sent in the last hour |
| `activatedAt` | BigInt NULL |  |  |

Indexes: (email)


## Settings Service: `pos_settings_db`

### `shop_profiles` (model ShopProfile)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `accountId` | Int |  |  |
| `ownerId` | Int NULL |  |  |
| `name` | VarChar(150) |  |  |
| `address` | VarChar(255) |  |  |
| `phone` | VarChar(30) |  |  |
| `email` | VarChar(254) NULL |  |  |
| `website` | VarChar(255) NULL |  |  |
| `timezone` | VarChar(60) NULL |  | one of the five labels in config/constants/timezones.js; empty until the shop is edited after signup |
| `imagePath` | VarChar(60) NULL |  | generated <uuid>.png|jpg file name in the uploads folder, never a path |
| `createdAt` | DateTime(3) | default now |  |
| `updatedAt` | DateTime(3) | auto-updated |  |

Indexes: (accountId)


## Staff Service: `pos_staff_db`

### `staff_roles` (model StaffRole)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `accountId` | Int |  |  |
| `shopId` | Int |  |  |
| `name` | VarChar(50) |  |  |
| `grants` | Json |  | { "Staff Management": ["view", "add", ...], ... }: the permission matrix, saved all at once |
| `createdAt` | DateTime(3) | default now |  |
| `updatedAt` | DateTime(3) | auto-updated |  |

Unique: (shopId, name)

### `staff_teams` (model StaffTeam)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `accountId` | Int |  |  |
| `shopId` | Int |  |  |
| `name` | VarChar(50) |  |  |
| `createdAt` | DateTime(3) | default now |  |
| `updatedAt` | DateTime(3) | auto-updated |  |

Unique: (shopId, name)

### `shifts` (model Shift)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `accountId` | Int |  |  |
| `shopId` | Int |  |  |
| `name` | VarChar(50) |  |  |
| `startTime` | VarChar(5) |  | HH:mm |
| `endTime` | VarChar(5) |  | HH:mm |
| `active` | Boolean | default true |  |
| `createdAt` | DateTime(3) | default now |  |
| `updatedAt` | DateTime(3) | auto-updated |  |

Unique: (shopId, name)

### `staff` (model Staff)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `accountId` | Int |  |  |
| `shopId` | Int |  |  |
| `codeNumber` | Int |  | STF0012 = 12, generated per shop, never reused (removed staff keep theirs) |
| `name` | VarChar(150) |  |  |
| `gender` | VarChar(10) |  |  |
| `phone` | VarChar(255) |  |  |
| `phoneNormalized` | VarChar(20) |  |  |
| `email` | VarChar(254) |  | stored lower-case |
| `nic` | VarChar(20) |  | upper-case, no spaces |
| `dob` | Date |  |  |
| `address` | VarChar(255) |  |  |
| `emergencyName` | VarChar(150) |  |  |
| `emergencyRelationship` | VarChar(100) |  |  |
| `emergencyPhone` | VarChar(255) |  |  |
| `imagePath` | VarChar(60) NULL |  | generated file name in the private staff folder, never a path |
| `joinDate` | Date |  |  |
| `roleId` | Int |  |  |
| `teamId` | Int |  |  |
| `shiftId` | Int |  |  |
| `employmentType` | VarChar(20) |  |  |
| `active` | Boolean | default true |  |
| `inactiveReason` | VarChar(255) NULL |  |  |
| `workingDays` | Json |  | ["mon", "tue", ...] |
| `hoursPerWeek` | Int |  |  |
| `username` | VarChar(50) |  |  |
| `usernameKey` | VarChar(50) |  | lower-case username: unique per account |
| `passwordHash` | VarChar(255) |  | salted scrypt; staff cannot sign in yet |
| `salaryType` | VarChar(10) NULL |  |  |
| `salaryBasic` | Decimal(12, 2) NULL |  |  |
| `salaryOvertime` | Boolean NULL |  |  |
| `salaryOtRate` | Decimal(12, 2) NULL |  |  |
| `salaryPaymentMethod` | VarChar(20) NULL |  |  |
| `salaryBankName` | VarChar(100) NULL |  |  |
| `salaryAccountNumber` | VarChar(50) NULL |  |  |
| `epfAllowed` | Boolean NULL |  |  |
| `epfEmployerNumber` | VarChar(50) NULL |  |  |
| `epfEmployeeNumber` | VarChar(50) NULL |  |  |
| `epfEmployeeRate` | Decimal(5, 2) NULL |  |  |
| `epfEmployerRate` | Decimal(5, 2) NULL |  |  |
| `epfEtfRate` | Decimal(5, 2) NULL |  |  |
| `deletedAt` | DateTime(3) NULL |  | reversible removal: the row and its unique values stay reserved |
| `createdAt` | DateTime(3) | default now |  |
| `updatedAt` | DateTime(3) | auto-updated |  |

Unique: (shopId, codeNumber), (shopId, email), (shopId, phoneNormalized), (shopId, nic), (accountId, usernameKey)  
Indexes: (shopId, deletedAt, active), (roleId), (teamId), (shiftId)  
Foreign key `roleId` -> `StaffRole.id` (on delete: default)  
Foreign key `teamId` -> `StaffTeam.id` (on delete: default)  
Foreign key `shiftId` -> `Shift.id` (on delete: default)

### `staff_documents` (model StaffDocument)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `staffId` | Int |  |  |
| `slot` | VarChar(10) |  | cv | idCopy | agreement |
| `storedName` | VarChar(60) |  | generated file name in the private documents folder |
| `fileName` | VarChar(80) |  | the client's name, cut to a safe label (never used as a path) |
| `type` | VarChar(5) |  | pdf | doc | docx | png | jpg |
| `size` | Int |  |  |
| `uploadedAt` | DateTime(3) |  |  |

Primary key: (staffId, slot)  
Foreign key `staffId` -> `Staff.id` (on delete: Cascade)

### `shift_assignments` (model ShiftAssignment)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `staffId` | Int |  |  |
| `weekday` | VarChar(3) |  | mon..sun |
| `shiftId` | Int NULL |  |  |
| `isOff` | Boolean | default false |  |

Primary key: (staffId, weekday)  
Indexes: (shiftId)  
Foreign key `staffId` -> `Staff.id` (on delete: Cascade)  
Foreign key `shiftId` -> `Shift.id` (on delete: default)

### `attendance` (model Attendance)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `accountId` | Int |  |  |
| `shopId` | Int |  |  |
| `staffId` | Int |  |  |
| `date` | Date |  |  |
| `checkInAt` | VarChar(19) |  | local time, YYYY-MM-DDTHH:mm:ss |
| `checkOutAt` | VarChar(19) NULL |  |  |
| `createdAt` | DateTime(3) | default now |  |
| `updatedAt` | DateTime(3) | auto-updated |  |

Unique: (staffId, date)  
Indexes: (shopId, date)  
Foreign key `staffId` -> `Staff.id` (on delete: default)

### `leaves` (model Leave)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `accountId` | Int |  |  |
| `shopId` | Int |  |  |
| `staffId` | Int |  |  |
| `type` | VarChar(20) |  | hour_permission | half_day | full_day |
| `date` | Date |  |  |
| `startTime` | VarChar(5) NULL |  |  |
| `endTime` | VarChar(5) NULL |  |  |
| `half` | VarChar(6) NULL |  | first | second |
| `reason` | VarChar(255) |  |  |
| `createdAt` | DateTime(3) | default now |  |
| `updatedAt` | DateTime(3) | auto-updated |  |

Unique: (staffId, date)  
Indexes: (shopId, date)  
Foreign key `staffId` -> `Staff.id` (on delete: default)

### `payroll_records` (model PayrollRecord)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `accountId` | Int |  |  |
| `shopId` | Int |  |  |
| `staffId` | Int |  |  |
| `payDate` | Date |  |  |
| `basicSalary` | Decimal(12, 2) |  |  |
| `paidOn` | DateTime(3) NULL |  |  |
| `snapshot` | Json NULL |  |  |
| `createdAt` | DateTime(3) | default now |  |
| `updatedAt` | DateTime(3) | auto-updated |  |

Indexes: (staffId, payDate), (shopId, payDate)  
Foreign key `staffId` -> `Staff.id` (on delete: default)

### `payroll_rewards` (model PayrollReward)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `accountId` | Int |  |  |
| `shopId` | Int |  |  |
| `staffId` | Int |  |  |
| `date` | Date |  |  |
| `reason` | VarChar(40) |  |  |
| `specificReason` | VarChar(255) NULL |  | only when the reason is "Other" |
| `amount` | Decimal(12, 2) |  |  |
| `createdAt` | DateTime(3) | default now |  |
| `updatedAt` | DateTime(3) | auto-updated |  |

Indexes: (staffId, date), (shopId, date)  
Foreign key `staffId` -> `Staff.id` (on delete: default)

### `payroll_deductions` (model PayrollDeduction)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `accountId` | Int |  |  |
| `shopId` | Int |  |  |
| `staffId` | Int |  |  |
| `date` | Date |  |  |
| `reason` | VarChar(40) |  |  |
| `specificReason` | VarChar(255) NULL |  |  |
| `totalAmount` | Decimal(12, 2) |  |  |
| `monthlyAmount` | Decimal(12, 2) |  | never more than the total (checked by the service) |
| `createdAt` | DateTime(3) | default now |  |
| `updatedAt` | DateTime(3) | auto-updated |  |

Indexes: (staffId, date), (shopId, date)  
Foreign key `staffId` -> `Staff.id` (on delete: default)


## Menu Service: `pos_menu_db`

### `categories` (model Category)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `name` | VarChar(100) | unique |  |
| `createdAt` | DateTime(3) | default now |  |

### `discounts` (model Discount)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `name` | VarChar(100) | unique |  |
| `percentage` | Decimal(5, 2) |  | 0 to 100, at most 2 decimals |
| `createdAt` | DateTime(3) | default now |  |

### `ingredients` (model Ingredient)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `name` | VarChar(100) | unique |  |
| `createdAt` | DateTime(3) | default now |  |

### `products` (model Product)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `name` | VarChar(150) |  |  |
| `categoryId` | Int |  |  |
| `costPrice` | Decimal(10, 2) NULL |  | optional (confirmed by the Figma) |
| `sellingPrice` | Decimal(10, 2) |  |  |
| `quantity` | BigInt |  | whole number from 0; the validation allows values above 32 bits |
| `lowStockAlert` | BigInt NULL |  | optional, no default: without one a product is only In Stock or Out of stock |
| `discountId` | Int NULL |  |  |
| `imagePath` | VarChar(60) NULL |  | generated <uuid>.png|jpg file name, never a path |
| `createdAt` | DateTime(3) | default now |  |
| `updatedAt` | DateTime(3) | auto-updated |  |

Indexes: (categoryId), (discountId)  
Foreign key `categoryId` -> `Category.id` (on delete: default)  
Foreign key `discountId` -> `Discount.id` (on delete: default)

### `product_ingredients` (model ProductIngredient)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `productId` | Int |  |  |
| `ingredientId` | Int |  |  |
| `quantity` | VarChar(50) |  | free text such as "40 g" |
| `position` | Int |  |  |

Primary key: (productId, ingredientId)  
Indexes: (ingredientId)  
Foreign key `productId` -> `Product.id` (on delete: Cascade)  
Foreign key `ingredientId` -> `Ingredient.id` (on delete: default)


## Sales Service: `pos_sales_db`

### `orders` (model Order)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `accountId` | Int |  |  |
| `shopId` | Int |  |  |
| `orderNumber` | VarChar(30) |  | shown to users, for example #ORD12; unique per shop |
| `type` | VarChar(20) |  | 'Take Away' | 'Dine-In' (config/constants/orders.js) |
| `status` | VarChar(20) |  | 'Paid' | 'Preparing' | 'Pending' | 'Delivered' | 'Cancelled' |
| `customerId` | Int NULL |  | no customer table exists yet, nothing sets this |
| `customerName` | VarChar(100) NULL |  |  |
| `tableLabel` | VarChar(30) NULL |  |  |
| `subtotal` | Decimal(10, 2) |  | sum of quantity x unitPrice before discounts; calculated by the service |
| `discountTotal` | Decimal(10, 2) | default 0 | sum of the line discounts |
| `total` | Decimal(10, 2) |  | subtotal - discountTotal; calculated by the service, never taken from a client |
| `placedAt` | DateTime(0) |  | business wall-clock time stored as is (no zone conversion), like the legacy 'YYYY-MM-DDTHH:mm:ss' |
| `createdAt` | DateTime(3) | default now |  |
| `updatedAt` | DateTime(3) | auto-updated |  |

Unique: (shopId, orderNumber)  
Indexes: (accountId, placedAt), (shopId, placedAt), (shopId, status)

### `order_items` (model OrderItem)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `orderId` | Int |  |  |
| `productId` | Int NULL |  | Menu Service product id at order time; no key, the product may be deleted later |
| `name` | VarChar(150) |  | copied from the product when the order is placed |
| `unitPrice` | Decimal(10, 2) |  | copied from the product when the order is placed |
| `quantity` | Int |  |  |
| `position` | Int |  | keeps the order the lines were placed in |
| `discountPercentage` | Decimal(5, 2) | default 0 | percentage of the discount application applied to this line (0 = none) |
| `discountAmount` | Decimal(10, 2) | default 0 | money taken off this line: round(quantity x unitPrice x percentage / 100) |
| `discountApplicationId` | Int NULL |  | the application that gave the discount; no key, the application may be deleted later |

Indexes: (orderId), (productId)  
Foreign key `orderId` -> `Order.id` (on delete: Cascade)

### `discount_applications` (model DiscountApplication)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `accountId` | Int |  |  |
| `discountId` | Int |  | Menu Service discount definition id |
| `discountName` | VarChar(100) |  | copied from the definition when saved |
| `discountPercentage` | Decimal(5, 2) |  | copied from the definition when saved |
| `startDate` | Date |  |  |
| `endDate` | Date |  |  |
| `status` | VarChar(20) |  | 'Active' | 'Inactive' |
| `appliesToAll` | Boolean |  |  |
| `createdAt` | DateTime(3) | default now |  |
| `updatedAt` | DateTime(3) | auto-updated |  |

Indexes: (accountId)

### `discount_application_products` (model DiscountApplicationProduct)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `applicationId` | Int |  |  |
| `productId` | Int |  | Menu Service product id; no key across databases |

Primary key: (applicationId, productId)  
Indexes: (productId)  
Foreign key `applicationId` -> `DiscountApplication.id` (on delete: Cascade)

### `payments` (model Payment)

| Column | Type | Notes | Comment |
|---|---|---|---|
| `id` | Int | PK, auto |  |
| `orderId` | Int | unique |  |
| `accountId` | Int |  |  |
| `method` | VarChar(10) |  | 'Cash' | 'Card' |
| `amount` | Decimal(10, 2) |  | equals orders.total at the time of payment |
| `paidAt` | DateTime(0) |  | business wall-clock time, like orders.placedAt |
| `recordedBy` | Int |  | Auth Service user id of whoever recorded it; no key across databases |
| `createdAt` | DateTime(3) | default now |  |

Indexes: (accountId, paidAt)  
Foreign key `orderId` -> `Order.id` (on delete: Restrict)

