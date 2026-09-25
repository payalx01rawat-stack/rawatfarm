ALTER TABLE `order`
    MODIFY COLUMN `status` ENUM(
        'DRAFT',
        'PLACED',
        'CONFIRMED',
        'PICKING',
        'PACKED',
        'ASSIGNED',
        'OUT_FOR_DELIVERY',
        'PARTIALLY_DELIVERED',
        'DELIVERED',
        'CANCELLED',
        'RETURNED'
    ) NOT NULL DEFAULT 'DRAFT';
