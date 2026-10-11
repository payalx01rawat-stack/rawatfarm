CREATE TABLE `CashHandover` (
    `id` VARCHAR(191) NOT NULL,
    `handoverNumber` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `deliveryPartnerId` VARCHAR(191) NOT NULL,
    `receivedByUserId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `idempotencyKey` VARCHAR(191) NOT NULL,
    `requestHash` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CashHandover_handoverNumber_key`(`handoverNumber`),
    UNIQUE INDEX `CashHandover_idempotencyKey_key`(`idempotencyKey`),
    INDEX `CashHandover_vendorId_createdAt_idx`(`vendorId`, `createdAt`),
    INDEX `CashHandover_deliveryPartnerId_createdAt_idx`(`deliveryPartnerId`, `createdAt`),
    PRIMARY KEY (`id`),
    CONSTRAINT `CashHandover_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `CashHandover_deliveryPartnerId_fkey` FOREIGN KEY (`deliveryPartnerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT `CashHandover_receivedByUserId_fkey` FOREIGN KEY (`receivedByUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
