-- AlterTable
ALTER TABLE `delivery` ADD COLUMN `vendorId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `order` ADD COLUMN `customerId` VARCHAR(191) NULL,
    ADD COLUMN `masterOrderId` VARCHAR(191) NULL,
    ADD COLUMN `vendorId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `payment` ADD COLUMN `deliveryPartnerId` VARCHAR(191) NULL,
    ADD COLUMN `vendorId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `product` ADD COLUMN `imageUrl` VARCHAR(191) NULL,
    ADD COLUMN `vendorId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `Vendor` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `imageUrl` VARCHAR(191) NULL,
    `contactPhone` VARCHAR(191) NULL,
    `contactEmail` VARCHAR(191) NULL,
    `address` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Vendor_isActive_createdAt_idx`(`isActive`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VendorUser` (
    `userId` VARCHAR(191) NOT NULL,
    `vendorId` VARCHAR(191) NOT NULL,
    `capabilities` JSON NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VendorUser_vendorId_idx`(`vendorId`),
    PRIMARY KEY (`userId`, `vendorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MasterOrder` (
    `id` VARCHAR(191) NOT NULL,
    `orderNumber` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NULL,
    `totalAmount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MasterOrder_orderNumber_key`(`orderNumber`),
    INDEX `MasterOrder_customerId_createdAt_idx`(`customerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Order_vendorId_createdAt_idx` ON `Order`(`vendorId`, `createdAt`);

-- CreateIndex
CREATE INDEX `Order_masterOrderId_idx` ON `Order`(`masterOrderId`);

-- CreateIndex
CREATE INDEX `Payment_vendorId_status_receivedAt_idx` ON `Payment`(`vendorId`, `status`, `receivedAt`);

-- CreateIndex
CREATE INDEX `Product_vendorId_status_idx` ON `Product`(`vendorId`, `status`);

-- AddForeignKey
ALTER TABLE `VendorUser` ADD CONSTRAINT `VendorUser_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VendorUser` ADD CONSTRAINT `VendorUser_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MasterOrder` ADD CONSTRAINT `MasterOrder_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_masterOrderId_fkey` FOREIGN KEY (`masterOrderId`) REFERENCES `MasterOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Delivery` ADD CONSTRAINT `Delivery_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_deliveryPartnerId_fkey` FOREIGN KEY (`deliveryPartnerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
