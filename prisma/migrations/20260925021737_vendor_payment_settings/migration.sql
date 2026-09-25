-- AlterTable
ALTER TABLE `vendor` ADD COLUMN `cashCollectionEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `paymentDisplayName` VARCHAR(191) NULL,
    ADD COLUMN `paymentInstructions` VARCHAR(191) NULL,
    ADD COLUMN `qrImageUrl` VARCHAR(191) NULL,
    ADD COLUMN `upiCollectionEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `upiId` VARCHAR(191) NULL;
