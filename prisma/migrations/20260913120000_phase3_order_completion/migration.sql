-- Phase 3 order completion: additive, data-preserving changes.
ALTER TABLE `User`
    ADD COLUMN `preferredLanguage` VARCHAR(191) NOT NULL DEFAULT 'en';

ALTER TABLE `DeliveryAssignment`
    ADD COLUMN `status` VARCHAR(30) NOT NULL DEFAULT 'ASSIGNED';

ALTER TABLE `Delivery`
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `deliveredByUserId` VARCHAR(191) NULL,
    ADD COLUMN `deliveryNotes` VARCHAR(191) NULL,
    ADD COLUMN `proofReference` VARCHAR(191) NULL,
    ADD INDEX `Delivery_deliveredByUserId_deliveredAt_idx` (`deliveredByUserId`, `deliveredAt`),
    ADD CONSTRAINT `Delivery_deliveredByUserId_fkey` FOREIGN KEY (`deliveredByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Payment`
    ADD COLUMN `receivedByUserId` VARCHAR(191) NULL,
    ADD COLUMN `receivedAt` DATETIME(3) NULL,
    ADD COLUMN `notes` VARCHAR(191) NULL,
    ADD INDEX `Payment_receivedByUserId_receivedAt_idx` (`receivedByUserId`, `receivedAt`),
    ADD CONSTRAINT `Payment_receivedByUserId_fkey` FOREIGN KEY (`receivedByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `ShopUser` (
    `userId` VARCHAR(191) NOT NULL,
    `shopId` VARCHAR(191) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `shopId`),
    INDEX `ShopUser_shopId_idx` (`shopId`),
    CONSTRAINT `ShopUser_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ShopUser_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `IdempotencyKey` (
    `key` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `requestHash` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`key`),
    UNIQUE INDEX `IdempotencyKey_orderId_key` (`orderId`),
    INDEX `IdempotencyKey_userId_createdAt_idx` (`userId`, `createdAt`),
    CONSTRAINT `IdempotencyKey_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `IdempotencyKey_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `OrderItem_productId_variantId_orderId_idx` ON `OrderItem` (`productId`, `variantId`, `orderId`);
