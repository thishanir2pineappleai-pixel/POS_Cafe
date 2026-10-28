-- CreateTable
CREATE TABLE `accounts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `role` VARCHAR(10) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `username` VARCHAR(50) NULL,
    `firstName` VARCHAR(100) NOT NULL,
    `lastName` VARCHAR(100) NOT NULL,
    `phone` VARCHAR(255) NOT NULL,
    `phoneNormalized` VARCHAR(20) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `imagePath` VARCHAR(60) NULL,
    `emailVerifiedAt` BIGINT NULL,
    `phoneVerifiedAt` BIGINT NULL,
    `lastLoginAt` BIGINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_accountId_idx`(`accountId`),
    INDEX `users_phoneNormalized_idx`(`phoneNormalized`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `sid` VARCHAR(36) NOT NULL,
    `userId` INTEGER NOT NULL,
    `accountId` INTEGER NOT NULL,
    `expiresAt` BIGINT NOT NULL,
    `createdAt` BIGINT NOT NULL,
    `revokedAt` BIGINT NULL,

    INDEX `sessions_userId_idx`(`userId`),
    PRIMARY KEY (`sid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `one_time_codes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `purpose` VARCHAR(30) NOT NULL,
    `subject` VARCHAR(64) NOT NULL,
    `hash` VARCHAR(64) NOT NULL,
    `expiresAt` BIGINT NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `usedAt` BIGINT NULL,
    `invalidatedAt` BIGINT NULL,
    `createdAt` BIGINT NOT NULL,

    INDEX `one_time_codes_purpose_subject_idx`(`purpose`, `subject`),
    INDEX `one_time_codes_purpose_hash_idx`(`purpose`, `hash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `registrations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tokenHash` VARCHAR(64) NULL,
    `tokenExpiresAt` BIGINT NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `username` VARCHAR(50) NOT NULL,
    `passwordHash` VARCHAR(255) NULL,
    `termsAcceptedAt` BIGINT NOT NULL,
    `status` VARCHAR(30) NOT NULL,
    `emailVerifiedAt` BIGINT NULL,
    `phoneVerifiedAt` BIGINT NULL,
    `createdAt` BIGINT NOT NULL,
    `ownerName` VARCHAR(100) NULL,
    `phone` VARCHAR(255) NULL,
    `phoneNormalized` VARCHAR(20) NULL,
    `businessName` VARCHAR(150) NULL,
    `address` VARCHAR(255) NULL,
    `accessKeyHash` VARCHAR(255) NULL,
    `accessKeyExpiresAt` BIGINT NULL,
    `accessKeyAttempts` INTEGER NOT NULL DEFAULT 0,
    `accessKeySends` JSON NULL,
    `activatedAt` BIGINT NULL,

    UNIQUE INDEX `registrations_tokenHash_key`(`tokenHash`),
    INDEX `registrations_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
