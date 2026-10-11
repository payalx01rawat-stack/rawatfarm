INSERT INTO `RolePermission` (`roleId`, `permissionId`)
SELECT `Role`.`id`, `Permission`.`id`
FROM `Role`
JOIN `Permission` ON `Permission`.`name` IN (
    'catalog.products.create',
    'catalog.products.update',
    'catalog.prices.create',
    'catalog.prices.update'
)
WHERE `Role`.`name` = 'CHILD_ADMIN'
  AND NOT EXISTS (
      SELECT 1
      FROM `RolePermission`
      WHERE `RolePermission`.`roleId` = `Role`.`id`
        AND `RolePermission`.`permissionId` = `Permission`.`id`
  );
