-- DropIndex
DROP INDEX `Vendor_status_createdAt_idx` ON `vendor`;

-- AlterTable
ALTER TABLE `stockmovement` MODIFY `referenceType` VARCHAR(191) NULL;
