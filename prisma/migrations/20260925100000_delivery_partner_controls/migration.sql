ALTER TABLE `VendorUser` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX `VendorUser_vendorId_isActive_idx` ON `VendorUser`(`vendorId`, `isActive`);
CREATE INDEX `DeliveryAssignment_userId_assignedAt_idx` ON `DeliveryAssignment`(`userId`, `assignedAt`);
CREATE INDEX `DeliveryAssignment_deliveryId_status_idx` ON `DeliveryAssignment`(`deliveryId`, `status`);