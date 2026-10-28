-- CreateTable
CREATE TABLE `staff_roles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `shopId` INTEGER NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `grants` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `staff_roles_shopId_name_key`(`shopId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_teams` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `shopId` INTEGER NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `staff_teams_shopId_name_key`(`shopId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shifts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `shopId` INTEGER NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `startTime` VARCHAR(5) NOT NULL,
    `endTime` VARCHAR(5) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shifts_shopId_name_key`(`shopId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `shopId` INTEGER NOT NULL,
    `codeNumber` INTEGER NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `gender` VARCHAR(10) NOT NULL,
    `phone` VARCHAR(255) NOT NULL,
    `phoneNormalized` VARCHAR(20) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `nic` VARCHAR(20) NOT NULL,
    `dob` DATE NOT NULL,
    `address` VARCHAR(255) NOT NULL,
    `emergencyName` VARCHAR(150) NOT NULL,
    `emergencyRelationship` VARCHAR(100) NOT NULL,
    `emergencyPhone` VARCHAR(255) NOT NULL,
    `imagePath` VARCHAR(60) NULL,
    `joinDate` DATE NOT NULL,
    `roleId` INTEGER NOT NULL,
    `teamId` INTEGER NOT NULL,
    `shiftId` INTEGER NOT NULL,
    `employmentType` VARCHAR(20) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `inactiveReason` VARCHAR(255) NULL,
    `workingDays` JSON NOT NULL,
    `hoursPerWeek` INTEGER NOT NULL,
    `username` VARCHAR(50) NOT NULL,
    `usernameKey` VARCHAR(50) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `salaryType` VARCHAR(10) NULL,
    `salaryBasic` DECIMAL(12, 2) NULL,
    `salaryOvertime` BOOLEAN NULL,
    `salaryOtRate` DECIMAL(12, 2) NULL,
    `salaryPaymentMethod` VARCHAR(20) NULL,
    `salaryBankName` VARCHAR(100) NULL,
    `salaryAccountNumber` VARCHAR(50) NULL,
    `epfAllowed` BOOLEAN NULL,
    `epfEmployerNumber` VARCHAR(50) NULL,
    `epfEmployeeNumber` VARCHAR(50) NULL,
    `epfEmployeeRate` DECIMAL(5, 2) NULL,
    `epfEmployerRate` DECIMAL(5, 2) NULL,
    `epfEtfRate` DECIMAL(5, 2) NULL,
    `deletedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `staff_shopId_deletedAt_active_idx`(`shopId`, `deletedAt`, `active`),
    INDEX `staff_roleId_idx`(`roleId`),
    INDEX `staff_teamId_idx`(`teamId`),
    INDEX `staff_shiftId_idx`(`shiftId`),
    UNIQUE INDEX `staff_shopId_codeNumber_key`(`shopId`, `codeNumber`),
    UNIQUE INDEX `staff_shopId_email_key`(`shopId`, `email`),
    UNIQUE INDEX `staff_shopId_phoneNormalized_key`(`shopId`, `phoneNormalized`),
    UNIQUE INDEX `staff_shopId_nic_key`(`shopId`, `nic`),
    UNIQUE INDEX `staff_accountId_usernameKey_key`(`accountId`, `usernameKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_documents` (
    `staffId` INTEGER NOT NULL,
    `slot` VARCHAR(10) NOT NULL,
    `storedName` VARCHAR(60) NOT NULL,
    `fileName` VARCHAR(80) NOT NULL,
    `type` VARCHAR(5) NOT NULL,
    `size` INTEGER NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`staffId`, `slot`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shift_assignments` (
    `staffId` INTEGER NOT NULL,
    `weekday` VARCHAR(3) NOT NULL,
    `shiftId` INTEGER NULL,
    `isOff` BOOLEAN NOT NULL DEFAULT false,

    INDEX `shift_assignments_shiftId_idx`(`shiftId`),
    PRIMARY KEY (`staffId`, `weekday`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendance` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `shopId` INTEGER NOT NULL,
    `staffId` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `checkInAt` VARCHAR(19) NOT NULL,
    `checkOutAt` VARCHAR(19) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `attendance_shopId_date_idx`(`shopId`, `date`),
    UNIQUE INDEX `attendance_staffId_date_key`(`staffId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leaves` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `shopId` INTEGER NOT NULL,
    `staffId` INTEGER NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `date` DATE NOT NULL,
    `startTime` VARCHAR(5) NULL,
    `endTime` VARCHAR(5) NULL,
    `half` VARCHAR(6) NULL,
    `reason` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `leaves_shopId_date_idx`(`shopId`, `date`),
    UNIQUE INDEX `leaves_staffId_date_key`(`staffId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payroll_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `shopId` INTEGER NOT NULL,
    `staffId` INTEGER NOT NULL,
    `payDate` DATE NOT NULL,
    `basicSalary` DECIMAL(12, 2) NOT NULL,
    `paidOn` DATETIME(3) NULL,
    `snapshot` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `payroll_records_staffId_payDate_idx`(`staffId`, `payDate`),
    INDEX `payroll_records_shopId_payDate_idx`(`shopId`, `payDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payroll_rewards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `shopId` INTEGER NOT NULL,
    `staffId` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `reason` VARCHAR(40) NOT NULL,
    `specificReason` VARCHAR(255) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `payroll_rewards_staffId_date_idx`(`staffId`, `date`),
    INDEX `payroll_rewards_shopId_date_idx`(`shopId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payroll_deductions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `shopId` INTEGER NOT NULL,
    `staffId` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `reason` VARCHAR(40) NOT NULL,
    `specificReason` VARCHAR(255) NULL,
    `totalAmount` DECIMAL(12, 2) NOT NULL,
    `monthlyAmount` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `payroll_deductions_staffId_date_idx`(`staffId`, `date`),
    INDEX `payroll_deductions_shopId_date_idx`(`shopId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `staff` ADD CONSTRAINT `staff_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `staff_roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff` ADD CONSTRAINT `staff_teamId_fkey` FOREIGN KEY (`teamId`) REFERENCES `staff_teams`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff` ADD CONSTRAINT `staff_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `shifts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_documents` ADD CONSTRAINT `staff_documents_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shift_assignments` ADD CONSTRAINT `shift_assignments_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shift_assignments` ADD CONSTRAINT `shift_assignments_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `shifts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leaves` ADD CONSTRAINT `leaves_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_records` ADD CONSTRAINT `payroll_records_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_rewards` ADD CONSTRAINT `payroll_rewards_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_deductions` ADD CONSTRAINT `payroll_deductions_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `staff`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
