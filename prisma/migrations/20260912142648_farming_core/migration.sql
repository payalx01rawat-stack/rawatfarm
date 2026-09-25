-- CreateTable
CREATE TABLE `FarmerProfile` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `farmerCode` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `village` VARCHAR(191) NULL,
    `district` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `pincode` VARCHAR(191) NULL,
    `landArea` DECIMAL(12, 2) NULL,
    `landUnit` VARCHAR(191) NULL DEFAULT 'ACRE',
    `experienceYears` INTEGER NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `FarmerProfile_userId_key`(`userId`),
    UNIQUE INDEX `FarmerProfile_farmerCode_key`(`farmerCode`),
    INDEX `FarmerProfile_status_idx`(`status`),
    INDEX `FarmerProfile_district_state_idx`(`district`, `state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Farm` (
    `id` VARCHAR(191) NOT NULL,
    `farmerId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `type` ENUM('POULTRY', 'GOAT', 'SHEEP', 'MIXED') NOT NULL DEFAULT 'MIXED',
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `addressLine1` VARCHAR(191) NULL,
    `addressLine2` VARCHAR(191) NULL,
    `village` VARCHAR(191) NULL,
    `district` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `pincode` VARCHAR(191) NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `totalArea` DECIMAL(12, 2) NULL,
    `areaUnit` VARCHAR(191) NULL DEFAULT 'ACRE',
    `establishedAt` DATETIME(3) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Farm_code_key`(`code`),
    INDEX `Farm_farmerId_status_idx`(`farmerId`, `status`),
    INDEX `Farm_type_status_idx`(`type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LivestockBatch` (
    `id` VARCHAR(191) NOT NULL,
    `farmId` VARCHAR(191) NOT NULL,
    `batchCode` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `livestockType` ENUM('DESI_CHICKEN', 'REGULAR_CHICKEN', 'DESI_MUTTON', 'REGULAR_MUTTON') NOT NULL,
    `trackingMode` ENUM('BATCH', 'INDIVIDUAL') NOT NULL DEFAULT 'BATCH',
    `status` ENUM('ACTIVE', 'SOLD', 'DECEASED', 'TRANSFERRED', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `breed` VARCHAR(191) NULL,
    `gender` ENUM('MALE', 'FEMALE', 'MIXED', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `initialQuantity` INTEGER NOT NULL,
    `currentQuantity` INTEGER NOT NULL,
    `purchaseDate` DATETIME(3) NULL,
    `arrivalDate` DATETIME(3) NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `ageInDays` INTEGER NULL,
    `averageWeight` DECIMAL(10, 3) NULL,
    `totalWeight` DECIMAL(12, 3) NULL,
    `purchaseCost` DECIMAL(14, 2) NULL,
    `currentValue` DECIMAL(14, 2) NULL,
    `sellingPricePerUnit` DECIMAL(14, 2) NULL,
    `mortalityCount` INTEGER NOT NULL DEFAULT 0,
    `soldCount` INTEGER NOT NULL DEFAULT 0,
    `healthStatus` ENUM('HEALTHY', 'UNDER_OBSERVATION', 'SICK', 'RECOVERING', 'CRITICAL', 'DECEASED') NOT NULL DEFAULT 'HEALTHY',
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LivestockBatch_batchCode_key`(`batchCode`),
    INDEX `LivestockBatch_farmId_status_idx`(`farmId`, `status`),
    INDEX `LivestockBatch_livestockType_status_idx`(`livestockType`, `status`),
    INDEX `LivestockBatch_healthStatus_idx`(`healthStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FeedRecord` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `feedType` ENUM('STARTER', 'GROWER', 'FINISHER', 'GRAIN', 'GREEN_FODDER', 'DRY_FODDER', 'MINERAL', 'SUPPLEMENT', 'CUSTOM') NOT NULL,
    `feedName` VARCHAR(191) NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `unit` VARCHAR(191) NOT NULL DEFAULT 'KG',
    `cost` DECIMAL(14, 2) NULL,
    `feedingDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` VARCHAR(191) NULL,

    INDEX `FeedRecord_batchId_feedingDate_idx`(`batchId`, `feedingDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HealthRecord` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `type` ENUM('CHECKUP', 'TREATMENT', 'DISEASE', 'INJURY', 'DEWORMING', 'VACCINATION', 'OTHER') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `symptoms` VARCHAR(191) NULL,
    `diagnosis` VARCHAR(191) NULL,
    `treatment` VARCHAR(191) NULL,
    `medicineName` VARCHAR(191) NULL,
    `medicineDose` VARCHAR(191) NULL,
    `cost` DECIMAL(14, 2) NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `followUpAt` DATETIME(3) NULL,
    `veterinarianName` VARCHAR(191) NULL,
    `veterinarianPhone` VARCHAR(191) NULL,

    INDEX `HealthRecord_batchId_recordedAt_idx`(`batchId`, `recordedAt`),
    INDEX `HealthRecord_type_idx`(`type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BreedingRecord` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `status` ENUM('PLANNED', 'SUCCESSFUL', 'FAILED', 'COMPLETED') NOT NULL DEFAULT 'PLANNED',
    `breedingDate` DATETIME(3) NOT NULL,
    `expectedDate` DATETIME(3) NULL,
    `maleCount` INTEGER NOT NULL DEFAULT 0,
    `femaleCount` INTEGER NOT NULL DEFAULT 0,
    `offspringCount` INTEGER NOT NULL DEFAULT 0,
    `notes` VARCHAR(191) NULL,

    INDEX `BreedingRecord_batchId_breedingDate_idx`(`batchId`, `breedingDate`),
    INDEX `BreedingRecord_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductionRecord` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `type` ENUM('EGG', 'MILK', 'MEAT', 'MANURE', 'OTHER') NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `unit` VARCHAR(191) NOT NULL,
    `productionDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `unitPrice` DECIMAL(14, 2) NULL,
    `totalValue` DECIMAL(14, 2) NULL,
    `notes` VARCHAR(191) NULL,

    INDEX `ProductionRecord_batchId_productionDate_idx`(`batchId`, `productionDate`),
    INDEX `ProductionRecord_type_productionDate_idx`(`type`, `productionDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FarmExpense` (
    `id` VARCHAR(191) NOT NULL,
    `farmId` VARCHAR(191) NOT NULL,
    `category` ENUM('FEED', 'MEDICINE', 'VACCINATION', 'LABOUR', 'PURCHASE', 'ELECTRICITY', 'WATER', 'TRANSPORT', 'MAINTENANCE', 'OTHER') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `expenseDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `referenceNumber` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,

    INDEX `FarmExpense_farmId_expenseDate_idx`(`farmId`, `expenseDate`),
    INDEX `FarmExpense_category_expenseDate_idx`(`category`, `expenseDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LivestockExpense` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `category` ENUM('FEED', 'MEDICINE', 'VACCINATION', 'LABOUR', 'PURCHASE', 'ELECTRICITY', 'WATER', 'TRANSPORT', 'MAINTENANCE', 'OTHER') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `expenseDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `referenceNumber` VARCHAR(191) NULL,
    `notes` VARCHAR(191) NULL,

    INDEX `LivestockExpense_batchId_expenseDate_idx`(`batchId`, `expenseDate`),
    INDEX `LivestockExpense_category_expenseDate_idx`(`category`, `expenseDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `FarmerProfile` ADD CONSTRAINT `FarmerProfile_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Farm` ADD CONSTRAINT `Farm_farmerId_fkey` FOREIGN KEY (`farmerId`) REFERENCES `FarmerProfile`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LivestockBatch` ADD CONSTRAINT `LivestockBatch_farmId_fkey` FOREIGN KEY (`farmId`) REFERENCES `Farm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FeedRecord` ADD CONSTRAINT `FeedRecord_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `LivestockBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HealthRecord` ADD CONSTRAINT `HealthRecord_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `LivestockBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BreedingRecord` ADD CONSTRAINT `BreedingRecord_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `LivestockBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionRecord` ADD CONSTRAINT `ProductionRecord_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `LivestockBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FarmExpense` ADD CONSTRAINT `FarmExpense_farmId_fkey` FOREIGN KEY (`farmId`) REFERENCES `Farm`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LivestockExpense` ADD CONSTRAINT `LivestockExpense_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `LivestockBatch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
