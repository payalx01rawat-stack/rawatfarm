CREATE TABLE `ChildAdminPermission` (
    `userId` VARCHAR(191) NOT NULL,
    `permissionId` VARCHAR(191) NOT NULL,

    INDEX `ChildAdminPermission_permissionId_idx`(`permissionId`),
    PRIMARY KEY (`userId`, `permissionId`),
    CONSTRAINT `ChildAdminPermission_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `ChildAdminPermission_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `Permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `ChildAdminPermission` (`userId`, `permissionId`)
SELECT `UserRole`.`userId`, `RolePermission`.`permissionId`
FROM `UserRole`
JOIN `Role` ON `Role`.`id` = `UserRole`.`roleId`
JOIN `RolePermission` ON `RolePermission`.`roleId` = `Role`.`id`
JOIN `Permission` ON `Permission`.`id` = `RolePermission`.`permissionId`
WHERE `Role`.`name` = 'CHILD_ADMIN'
  AND `Permission`.`name` IN (
    'users.read',
    'shops.read',
    'catalog.categories.read',
    'catalog.units.read',
    'catalog.products.read',
    'catalog.products.create',
    'catalog.products.update',
    'catalog.prices.read',
    'catalog.prices.create',
    'catalog.prices.update',
    'orders.read'
  );
