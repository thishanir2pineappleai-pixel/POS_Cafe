-- CreateTable
CREATE TABLE `orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `shopId` INTEGER NOT NULL,
    `orderNumber` VARCHAR(30) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `customerId` INTEGER NULL,
    `customerName` VARCHAR(100) NULL,
    `tableLabel` VARCHAR(30) NULL,
    `subtotal` DECIMAL(10, 2) NOT NULL,
    `discountTotal` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(10, 2) NOT NULL,
    `placedAt` DATETIME(0) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `orders_accountId_placedAt_idx`(`accountId`, `placedAt`),
    INDEX `orders_shopId_placedAt_idx`(`shopId`, `placedAt`),
    INDEX `orders_shopId_status_idx`(`shopId`, `status`),
    UNIQUE INDEX `orders_shopId_orderNumber_key`(`shopId`, `orderNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `productId` INTEGER NULL,
    `name` VARCHAR(150) NOT NULL,
    `unitPrice` DECIMAL(10, 2) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `position` INTEGER NOT NULL,
    `discountPercentage` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `discountAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `discountApplicationId` INTEGER NULL,

    INDEX `order_items_orderId_idx`(`orderId`),
    INDEX `order_items_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `discount_applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `accountId` INTEGER NOT NULL,
    `discountId` INTEGER NOT NULL,
    `discountName` VARCHAR(100) NOT NULL,
    `discountPercentage` DECIMAL(5, 2) NOT NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `appliesToAll` BOOLEAN NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `discount_applications_accountId_idx`(`accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `discount_application_products` (
    `applicationId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,

    INDEX `discount_application_products_productId_idx`(`productId`),
    PRIMARY KEY (`applicationId`, `productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `discount_application_products` ADD CONSTRAINT `discount_application_products_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `discount_applications`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

