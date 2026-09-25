ALTER TABLE `Product`
  ADD COLUMN `stockQuantity` DECIMAL(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN `lowStockThreshold` DECIMAL(14,3) NOT NULL DEFAULT 5,
  ADD COLUMN `trackInventory` BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE `ProductVariant`
  ADD COLUMN `stockQuantity` DECIMAL(14,3) NOT NULL DEFAULT 0,
  ADD COLUMN `lowStockThreshold` DECIMAL(14,3) NOT NULL DEFAULT 5,
  ADD COLUMN `trackInventory` BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE `StockMovement` (
  `id` VARCHAR(191) NOT NULL,
  `vendorId` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `variantId` VARCHAR(191) NULL,
  `orderItemId` VARCHAR(191) NULL,
  `quantityDelta` DECIMAL(14,3) NOT NULL,
  `movementType` ENUM('INITIAL_STOCK', 'MANUAL_ADJUSTMENT', 'ORDER_DEDUCTION', 'ORDER_RESTORE', 'ORDER_CANCELLATION', 'RETURN_RESTORE', 'CORRECTION') NOT NULL,
  `reason` VARCHAR(191) NOT NULL,
  `referenceType` VARCHAR(80) NULL,
  `referenceId` VARCHAR(191) NULL,
  `stockBefore` DECIMAL(14,3) NOT NULL,
  `stockAfter` DECIMAL(14,3) NOT NULL,
  `createdByUserId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `StockMovement_vendorId_createdAt_idx` (`vendorId`, `createdAt`),
  INDEX `StockMovement_productId_variantId_createdAt_idx` (`productId`, `variantId`, `createdAt`),
  INDEX `StockMovement_referenceId_idx` (`referenceId`),
  CONSTRAINT `StockMovement_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `StockMovement_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `StockMovement_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `ProductVariant` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `StockMovement_orderItemId_fkey` FOREIGN KEY (`orderItemId`) REFERENCES `OrderItem` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `StockMovement_createdByUserId_fkey` FOREIGN KEY (`createdByUserId`) REFERENCES `User` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
