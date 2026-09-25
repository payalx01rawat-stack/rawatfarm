ALTER TABLE `Vendor`
  ADD COLUMN `status` ENUM('PENDING', 'APPROVED', 'SUSPENDED') NOT NULL DEFAULT 'APPROVED';

CREATE INDEX `Vendor_status_createdAt_idx` ON `Vendor`(`status`, `createdAt`);