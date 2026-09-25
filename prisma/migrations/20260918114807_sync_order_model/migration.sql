/*
  Warnings:

  - You are about to drop the column `deliveryDate` on the `order` table. All the data in the column will be lost.
  - You are about to drop the column `actualQuantity` on the `orderitem` table. All the data in the column will be lost.
  - You are about to drop the column `fromStatus` on the `orderstatushistory` table. All the data in the column will be lost.
  - You are about to drop the column `toStatus` on the `orderstatushistory` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `newStatus` to the `OrderStatusHistory` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `order` DROP FOREIGN KEY `Order_branchId_fkey`;

-- DropIndex
DROP INDEX `Order_branchId_fkey` ON `order`;

-- DropIndex
DROP INDEX `Order_status_deliveryDate_idx` ON `order`;

-- AlterTable
ALTER TABLE `deliveryassignment` MODIFY `status` VARCHAR(191) NOT NULL DEFAULT 'ASSIGNED';

-- AlterTable
ALTER TABLE `order` DROP COLUMN `deliveryDate`,
    ADD COLUMN `assignedAt` DATETIME(3) NULL,
    ADD COLUMN `cancellationReason` VARCHAR(191) NULL,
    ADD COLUMN `cancelledAt` DATETIME(3) NULL,
    ADD COLUMN `confirmedAt` DATETIME(3) NULL,
    ADD COLUMN `customerNotes` VARCHAR(191) NULL,
    ADD COLUMN `deliveredAt` DATETIME(3) NULL,
    ADD COLUMN `deliveryAddressId` VARCHAR(191) NULL,
    ADD COLUMN `deliveryCharge` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `discountAmount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `internalNotes` VARCHAR(191) NULL,
    ADD COLUMN `orderDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `otherCharges` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `packedAt` DATETIME(3) NULL,
    ADD COLUMN `placedAt` DATETIME(3) NULL,
    ADD COLUMN `requestedDeliveryDate` DATETIME(3) NULL,
    MODIFY `branchId` VARCHAR(191) NULL,
    MODIFY `subtotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    MODIFY `totalAmount` DECIMAL(14, 2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `orderitem` DROP COLUMN `actualQuantity`,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `deliveredQuantity` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    ADD COLUMN `discount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `notes` VARCHAR(191) NULL,
    ADD COLUMN `packedQuantity` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    ADD COLUMN `productNameSnapshot` VARCHAR(191) NULL,
    ADD COLUMN `returnedQuantity` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    ADD COLUMN `skuSnapshot` VARCHAR(191) NULL,
    ADD COLUMN `taxAmount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `taxRate` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    ADD COLUMN `unitSnapshot` VARCHAR(191) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL,
    ADD COLUMN `variantNameSnapshot` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `orderstatushistory` DROP COLUMN `fromStatus`,
    DROP COLUMN `toStatus`,
    ADD COLUMN `newStatus` ENUM('DRAFT', 'PLACED', 'CONFIRMED', 'PICKING', 'PACKED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED', 'RETURNED') NOT NULL,
    ADD COLUMN `previousStatus` ENUM('DRAFT', 'PLACED', 'CONFIRMED', 'PICKING', 'PACKED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED', 'RETURNED') NULL,
    ADD COLUMN `reason` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Order_orderNumber_idx` ON `Order`(`orderNumber`);

-- CreateIndex
CREATE INDEX `Order_status_requestedDeliveryDate_idx` ON `Order`(`status`, `requestedDeliveryDate`);

-- CreateIndex
CREATE INDEX `Order_orderDate_idx` ON `Order`(`orderDate`);

-- CreateIndex
CREATE INDEX `Order_createdAt_idx` ON `Order`(`createdAt`);

-- CreateIndex
CREATE INDEX `Order_requestedDeliveryDate_idx` ON `Order`(`requestedDeliveryDate`);

-- CreateIndex
CREATE INDEX `OrderItem_productId_idx` ON `OrderItem`(`productId`);

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DeliveryAssignment` ADD CONSTRAINT `DeliveryAssignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `orderitem` RENAME INDEX `OrderItem_variantId_fkey` TO `OrderItem_variantId_idx`;
