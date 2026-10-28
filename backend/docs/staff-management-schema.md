> **SUPERSEDED.** This was a *proposal* written before the database existed. The real schema is
> `backend/services/staff-service/prisma/schema.prisma` with its migration in `backend/services/staff-service/prisma/migrations/`.
> It differs in places: salary, EPF and emergency-contact data are columns on `staff`, role permissions are one JSON column, and the
> "one payroll record per staff member and month" rule is checked by the service. Kept for the reasoning in its notes.

# Staff Management: PROPOSED MySQL schema

**Nothing here has been run or created.** MySQL is not configured in this project (`.env`, `config/database/mysql.js` and
`database/schema.sql` are all empty), so Staff Management currently stores everything in memory
(`repositories/memory/*`, lost on restart). This file is the schema the future `repositories/mysql/*` files should target.
The repository method names already match, so only the repository layer changes.

Conventions: InnoDB, `utf8mb4`, money as `DECIMAL(12,2)`, dates `DATE`, times `TIME`, every row owned by a shop
(`shop_id`) and an account (`account_id`). `accounts(id)` and `shops(id)` are the tables proposed for the Authentication and
Settings modules (the shop profile table). All queries must be parameterized and filtered by `account_id` + `shop_id`.

```sql
CREATE TABLE staff_roles (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  account_id  BIGINT UNSIGNED NOT NULL,
  shop_id     BIGINT UNSIGNED NOT NULL,
  name        VARCHAR(50) NOT NULL,
  created_at  DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_role_shop_name (shop_id, name),            -- case-insensitive with the default utf8mb4_0900_ai_ci collation
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (shop_id)    REFERENCES shops(id)
);

CREATE TABLE staff_role_permissions (                       -- the Roles & Permission matrix; one row per granted cell
  role_id  BIGINT UNSIGNED NOT NULL,
  module   VARCHAR(40) NOT NULL,                            -- 'Staff Management', 'Menu Management', ... (9 modules known)
  action   ENUM('view','add','edit','delete') NOT NULL,
  PRIMARY KEY (role_id, module, action),
  FOREIGN KEY (role_id) REFERENCES staff_roles(id) ON DELETE CASCADE
);

CREATE TABLE staff_teams (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, account_id BIGINT UNSIGNED NOT NULL, shop_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(50) NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_team_shop_name (shop_id, name),
  FOREIGN KEY (account_id) REFERENCES accounts(id), FOREIGN KEY (shop_id) REFERENCES shops(id)
);

CREATE TABLE shifts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, account_id BIGINT UNSIGNED NOT NULL, shop_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(50) NOT NULL, start_time TIME NOT NULL, end_time TIME NOT NULL,   -- end < start means it runs past midnight
  active TINYINT(1) NOT NULL DEFAULT 1, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_shift_shop_name (shop_id, name), CHECK (start_time <> end_time),
  FOREIGN KEY (account_id) REFERENCES accounts(id), FOREIGN KEY (shop_id) REFERENCES shops(id)
);

CREATE TABLE staff (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  account_id        BIGINT UNSIGNED NOT NULL,
  shop_id           BIGINT UNSIGNED NOT NULL,
  code_number       INT UNSIGNED NOT NULL,                  -- STF0012 = 12, generated per shop (see note 1)
  name              VARCHAR(150) NOT NULL,
  gender            ENUM('Male','Female','Others') NOT NULL,
  phone             VARCHAR(30) NOT NULL,
  phone_normalized  VARCHAR(20) NOT NULL,
  email             VARCHAR(254) NOT NULL,                  -- stored lower-case
  nic               VARCHAR(20) NOT NULL,                   -- upper-case, no spaces
  dob               DATE NOT NULL,
  address           VARCHAR(255) NOT NULL,
  emergency_name VARCHAR(150) NOT NULL, emergency_relationship VARCHAR(100) NOT NULL, emergency_phone VARCHAR(30) NOT NULL,
  image_file        VARCHAR(60) NULL,                       -- generated file name in uploads/staff, never a path
  join_date         DATE NOT NULL,
  role_id           BIGINT UNSIGNED NOT NULL,
  team_id           BIGINT UNSIGNED NOT NULL,
  shift_id          BIGINT UNSIGNED NOT NULL,
  employment_type   ENUM('Fulltime','Part time','Contract','Intern') NOT NULL,
  active            TINYINT(1) NOT NULL DEFAULT 1,
  inactive_reason   VARCHAR(255) NULL,
  working_days      SET('mon','tue','wed','thu','fri','sat','sun') NOT NULL,
  hours_per_week    SMALLINT UNSIGNED NOT NULL,
  username          VARCHAR(50) NOT NULL,
  password_hash     VARCHAR(255) NOT NULL,                  -- salted scrypt; staff cannot sign in yet
  -- Employment Records (owner only)
  salary_type ENUM('Monthly','Daily','Hourly') NULL, basic_salary DECIMAL(12,2) NULL, overtime TINYINT(1) NULL, ot_rate DECIMAL(12,2) NULL,
  payment_method ENUM('Cash','Bank Transfer') NULL, bank_name VARCHAR(100) NULL, account_number VARCHAR(50) NULL,
  epf_allowed TINYINT(1) NULL, epf_employer_number VARCHAR(50) NULL, epf_employee_number VARCHAR(50) NULL,
  epf_employee_rate DECIMAL(5,2) NULL, epf_employer_rate DECIMAL(5,2) NULL, etf_rate DECIMAL(5,2) NULL,
  deleted_at        DATETIME NULL,                          -- soft removal (see note 2)
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_staff_code     (shop_id, code_number),
  UNIQUE KEY uq_staff_email    (shop_id, email),
  UNIQUE KEY uq_staff_phone    (shop_id, phone_normalized),
  UNIQUE KEY uq_staff_nic      (shop_id, nic),
  UNIQUE KEY uq_staff_username (account_id, username),      -- case-insensitive collation
  KEY ix_staff_filter (shop_id, deleted_at, active, role_id, team_id, shift_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id), FOREIGN KEY (shop_id) REFERENCES shops(id),
  FOREIGN KEY (role_id) REFERENCES staff_roles(id), FOREIGN KEY (team_id) REFERENCES staff_teams(id), FOREIGN KEY (shift_id) REFERENCES shifts(id)
);

CREATE TABLE staff_documents (                              -- CV/Resume, ID copy, Employment agreement (owner only)
  staff_id     BIGINT UNSIGNED NOT NULL,
  slot         ENUM('cv','idCopy','agreement') NOT NULL,
  stored_file  VARCHAR(60) NOT NULL,                        -- generated name in uploads/staff-documents
  file_label   VARCHAR(80) NOT NULL, file_type ENUM('pdf','doc','docx','png','jpg') NOT NULL,
  size_bytes   INT UNSIGNED NOT NULL, uploaded_at DATETIME NOT NULL,
  PRIMARY KEY (staff_id, slot), FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

CREATE TABLE shift_assignments (                            -- the weekly roster: one row per staff member and weekday
  staff_id BIGINT UNSIGNED NOT NULL,
  weekday  ENUM('mon','tue','wed','thu','fri','sat','sun') NOT NULL,
  shift_id BIGINT UNSIGNED NULL,                            -- NULL together with is_off = 1 means a day off
  is_off   TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (staff_id, weekday),                          -- the key IS the "one shift per person and day" rule
  CHECK ((is_off = 1 AND shift_id IS NULL) OR (is_off = 0 AND shift_id IS NOT NULL)),
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE, FOREIGN KEY (shift_id) REFERENCES shifts(id)
);

CREATE TABLE attendance_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, account_id BIGINT UNSIGNED NOT NULL, shop_id BIGINT UNSIGNED NOT NULL,
  staff_id BIGINT UNSIGNED NOT NULL, work_date DATE NOT NULL,
  check_in_at DATETIME NOT NULL, check_out_at DATETIME NULL,
  UNIQUE KEY uq_attendance_day (staff_id, work_date),       -- the "one check-in per day" rule
  KEY ix_attendance_shop_day (shop_id, work_date),
  FOREIGN KEY (staff_id) REFERENCES staff(id), FOREIGN KEY (shop_id) REFERENCES shops(id)
);

CREATE TABLE leave_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, account_id BIGINT UNSIGNED NOT NULL, shop_id BIGINT UNSIGNED NOT NULL,
  staff_id BIGINT UNSIGNED NOT NULL, leave_date DATE NOT NULL,
  leave_type ENUM('hour_permission','half_day','full_day') NOT NULL,
  start_time TIME NULL, end_time TIME NULL, half ENUM('first','second') NULL,
  reason VARCHAR(255) NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_leave_day (staff_id, leave_date),           -- provisional rule: one leave per staff member and date
  KEY ix_leave_shop_date (shop_id, leave_date),
  FOREIGN KEY (staff_id) REFERENCES staff(id), FOREIGN KEY (shop_id) REFERENCES shops(id)
);

CREATE TABLE payroll_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, account_id BIGINT UNSIGNED NOT NULL, shop_id BIGINT UNSIGNED NOT NULL,
  staff_id BIGINT UNSIGNED NOT NULL, pay_date DATE NOT NULL, pay_month CHAR(7) AS (DATE_FORMAT(pay_date, '%Y-%m')) STORED,
  basic_salary DECIMAL(12,2) NOT NULL,
  paid_on DATETIME NULL,
  paid_rewards DECIMAL(12,2) NULL, paid_deductions DECIMAL(12,2) NULL, paid_net_pay DECIMAL(12,2) NULL,   -- frozen when paid
  created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_payroll_month (staff_id, pay_month),        -- provisional rule: one record per staff member and month
  KEY ix_payroll_shop_date (shop_id, pay_date),
  FOREIGN KEY (staff_id) REFERENCES staff(id), FOREIGN KEY (shop_id) REFERENCES shops(id)
);

CREATE TABLE payroll_rewards (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, account_id BIGINT UNSIGNED NOT NULL, shop_id BIGINT UNSIGNED NOT NULL,
  staff_id BIGINT UNSIGNED NOT NULL, reward_date DATE NOT NULL, reason VARCHAR(40) NOT NULL, specific_reason VARCHAR(255) NULL,
  amount DECIMAL(12,2) NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  KEY ix_reward_staff_date (staff_id, reward_date), FOREIGN KEY (staff_id) REFERENCES staff(id), FOREIGN KEY (shop_id) REFERENCES shops(id)
);

CREATE TABLE payroll_deductions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, account_id BIGINT UNSIGNED NOT NULL, shop_id BIGINT UNSIGNED NOT NULL,
  staff_id BIGINT UNSIGNED NOT NULL, deduction_date DATE NOT NULL, reason VARCHAR(40) NOT NULL, specific_reason VARCHAR(255) NULL,
  total_amount DECIMAL(12,2) NOT NULL, monthly_amount DECIMAL(12,2) NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
  CHECK (monthly_amount <= total_amount),
  KEY ix_deduction_staff_date (staff_id, deduction_date), FOREIGN KEY (staff_id) REFERENCES staff(id), FOREIGN KEY (shop_id) REFERENCES shops(id)
);
```

## Notes

1. **Employee codes.** In MySQL, generate `code_number` inside the insert transaction
   (`SELECT COALESCE(MAX(code_number),0)+1 ... FOR UPDATE` on the shop's rows, then `INSERT`); the `uq_staff_code` key is the safety net.
   Removed rows are included so a code is never reused.
2. **Removal.** `DELETE /staff/:id` sets `deleted_at`. Every list and lookup adds `deleted_at IS NULL`. The unique keys still cover
   removed rows on purpose (their email, phone, NIC and code stay reserved until a real purge is approved).
3. **Transactions.** Creating a staff member (the `staff` row and its seven `shift_assignments` rows), changing shift or working days
   (which rewrites the roster), and replacing a role's permission cells must each be one transaction. So must paying a record.
4. **Ownership.** Every foreign key to a role, team or shift must be checked to belong to the same `shop_id` as the staff row
   (a composite foreign key `(shop_id, role_id)` against `UNIQUE (shop_id, id)` on the parent tables enforces it in SQL).
5. **Not modelled because the designs do not define it:** EPF/ETF contribution totals, tax, payroll approval, yearly leave allowance,
   staff sign-in and the other 16 of the "25 permissions".
