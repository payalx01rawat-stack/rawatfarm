import { resolve } from 'node:path';
import { PrismaClient } from '@farmmitra/database';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), '../../.env'), override: false });

const prisma = new PrismaClient();

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Development seed is disabled in production');
  }

  const roleNames = [
    'SUPER_ADMIN',
    'ADMIN',
    'MANAGER',
    'PACKING_STAFF',
    'DELIVERY_STAFF',
    'SHOP_OWNER',
    'VENDOR',
    'VENDOR_STAFF',
    'VENDOR_ADMIN',
    'DELIVERY_PARTNER',
    'CUSTOMER',
  ];

  const permissionNames = [
    'users.read',
    'users.create',
    'users.update',
    'users.roles.assign',

    'farmers.read',
    'farmers.create',
    'farmers.update',

    'shops.read',
    'shops.create',
    'shops.update',
    'shops.credit.manage',

    'warehouse.read',
    'warehouse.manage',
    'inventory.read',
    'inventory.receive',
    'inventory.issue',
    'inventory.reserve',
    'inventory.release',
    'inventory.adjust',
    'inventory.transfer',

    'catalog.categories.read',
    'catalog.categories.create',
    'catalog.categories.update',

    'catalog.units.read',
    'catalog.units.create',
    'catalog.units.update',

    'catalog.products.read',
    'catalog.products.create',
    'catalog.products.update',

    'catalog.variants.read',
    'catalog.variants.create',
    'catalog.variants.update',

    'catalog.prices.read',
    'catalog.prices.create',
    'catalog.prices.update',

    'orders.read',
    'orders.create',
    'orders.update',
    'orders.cancel',
    'orders.place',
    'orders.reorder',
    'vendors.manage',
  ];

  const rolePermissions: Record<string, string[]> = {
    SUPER_ADMIN: permissionNames,

    ADMIN: [
      'users.read',
      'users.create',
      'users.update',
      'users.roles.assign',

      'farmers.read',
      'farmers.create',
      'farmers.update',

      'shops.read',
      'shops.create',
      'shops.update',
      'shops.credit.manage',

      'warehouse.read',
      'warehouse.manage',
      'inventory.read',
      'inventory.receive',
      'inventory.issue',
      'inventory.reserve',
      'inventory.release',
      'inventory.adjust',
      'inventory.transfer',

      'catalog.categories.read',
      'catalog.categories.create',
      'catalog.categories.update',

      'catalog.units.read',
      'catalog.units.create',
      'catalog.units.update',

      'catalog.products.read',
      'catalog.products.create',
      'catalog.products.update',

      'catalog.variants.read',
      'catalog.variants.create',
      'catalog.variants.update',

      'catalog.prices.read',
      'catalog.prices.create',
      'catalog.prices.update',
      'orders.read',
      'orders.create',
      'orders.update',
      'orders.cancel',
      'orders.place',
      'orders.reorder',
    ],

    MANAGER: [
      'users.read',

      'farmers.read',
      'farmers.create',
      'farmers.update',

      'shops.read',
      'shops.create',
      'shops.update',

      'warehouse.read',
      'warehouse.manage',
      'inventory.read',
      'inventory.receive',
      'inventory.issue',
      'inventory.reserve',
      'inventory.release',
      'inventory.adjust',
      'inventory.transfer',

      'catalog.categories.read',
      'catalog.categories.create',
      'catalog.categories.update',

      'catalog.units.read',
      'catalog.units.create',
      'catalog.units.update',

      'catalog.products.read',
      'catalog.products.create',
      'catalog.products.update',

      'catalog.variants.read',
      'catalog.variants.create',
      'catalog.variants.update',

      'catalog.prices.read',
      'catalog.prices.create',
      'catalog.prices.update',

      'orders.read',
      'orders.create',
      'orders.update',
      'orders.cancel',
      'orders.place',
      'orders.reorder',
    ],

    PACKING_STAFF: [
      'farmers.read',
      'farmers.create',
      'farmers.update',

      'shops.read',
      'warehouse.read',
      'inventory.read',
      'catalog.products.read',
      'catalog.variants.read',
      'catalog.prices.read',
      'orders.read',
      'orders.update',
    ],

    DELIVERY_STAFF: [
      'farmers.read',
      'farmers.create',
      'farmers.update',

      'shops.read',
      'warehouse.read',
      'inventory.read',
      'orders.read',
      'orders.update',
    ],

    SHOP_OWNER: [
      'farmers.read',
      'farmers.create',
      'farmers.update',

      'shops.read',
      'shops.create',
      'shops.update',
      'shops.credit.manage',

      'warehouse.read',
      'inventory.read',

      'catalog.categories.read',
      'catalog.units.read',
      'catalog.products.read',
      'catalog.variants.read',
      'catalog.prices.read',
      'orders.read',
      'orders.create',
      'orders.place',
      'orders.cancel',
      'orders.reorder',
    ],

    VENDOR: ['vendors.manage', 'catalog.products.read', 'catalog.products.create', 'catalog.products.update', 'orders.read', 'orders.update'],
    VENDOR_STAFF: ['catalog.products.read', 'catalog.products.create', 'catalog.products.update', 'orders.read', 'orders.update'],
    VENDOR_ADMIN: ['vendors.manage', 'catalog.products.read', 'catalog.products.create', 'catalog.products.update', 'orders.read', 'orders.update'],
    DELIVERY_PARTNER: ['orders.read', 'orders.update'],
    CUSTOMER: ['catalog.products.read', 'orders.read', 'orders.create'],
  };

  await prisma.$transaction(async (transaction) => {
    const roles = new Map<string, string>();

    for (const name of roleNames) {
      const role = await transaction.role.upsert({
        where: { name },
        update: {},
        create: { name },
      });

      roles.set(name, role.id);
    }

    const permissions = new Map<string, string>();

    for (const name of permissionNames) {
      const permission = await transaction.permission.upsert({
        where: { name },
        update: {},
        create: { name },
      });

      permissions.set(name, permission.id);
    }

    for (const [roleName, rolePermissionNames] of Object.entries(rolePermissions)) {
      const roleId = roles.get(roleName);

      if (!roleId) {
        throw new Error(`Role ${roleName} was not created`);
      }

      for (const permissionName of rolePermissionNames) {
        const permissionId = permissions.get(permissionName);

        if (!permissionId) {
          throw new Error(
            `Permission ${permissionName} was not created`,
          );
        }

        await transaction.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId,
              permissionId,
            },
          },
          update: {},
          create: {
            roleId,
            permissionId,
          },
        });
      }
    }

    await transaction.unit.upsert({
      where: { code: 'KG' },
      update: {},
      create: {
        name: 'Kilogram',
        code: 'KG',
        precision: 3,
      },
    });

    await transaction.unit.upsert({
      where: { code: 'PCS' },
      update: {},
      create: {
        name: 'Pieces',
        code: 'PCS',
        precision: 0,
      },
    });
  });

  const localPassword = 'FarmMitraLocal123!';
  const roleId = async (name: string): Promise<string> => (await prisma.role.findUniqueOrThrow({ where: { name } })).id;
  const upsertUser = async (email: string, name: string, roleNames: string[]) => {
    const user = await prisma.user.upsert({
      where: { email },
      update: { name, status: 'ACTIVE', passwordHash: await bcrypt.hash(localPassword, 10) },
      create: { email, name, passwordHash: await bcrypt.hash(localPassword, 10), roles: { create: await Promise.all(roleNames.map(async (roleName) => ({ roleId: await roleId(roleName) }))) } },
      include: { roles: true },
    });
    for (const roleName of roleNames) await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: await roleId(roleName) } }, update: {}, create: { userId: user.id, roleId: await roleId(roleName) } });
    return user;
  };

  const [admin, vendorAAdmin, vendorBAdmin, customer, deliveryA] = await Promise.all([
    upsertUser('admin.local@farmmitra.test', 'Local Super Admin', ['SUPER_ADMIN']),
    upsertUser('vendor.a@farmmitra.test', 'Vendor A Admin', ['VENDOR', 'VENDOR_ADMIN']),
    upsertUser('vendor.b@farmmitra.test', 'Vendor B Admin', ['VENDOR', 'VENDOR_ADMIN']),
    upsertUser('customer.local@farmmitra.test', 'Local Customer', ['CUSTOMER']),
    upsertUser('rahul.delivery@farmmitra.test', 'Rahul Delivery', ['DELIVERY_PARTNER', 'DELIVERY_STAFF']),
  ]);

  const vendors = await Promise.all([
    prisma.vendor.upsert({ where: { id: 'cmfarmmitravendora000000000' }, update: { name: 'Vendor A', upiId: 'vendorA@upi', paymentDisplayName: 'Vendor A Fresh Foods' }, create: { id: 'cmfarmmitravendora000000000', name: 'Vendor A', upiId: 'vendorA@upi', paymentDisplayName: 'Vendor A Fresh Foods', paymentInstructions: 'Pay directly to Vendor A UPI.' } }),
    prisma.vendor.upsert({ where: { id: 'cmfarmmitravendorb000000000' }, update: { name: 'Vendor B', upiId: 'vendorB@upi', paymentDisplayName: 'Vendor B Market' }, create: { id: 'cmfarmmitravendorb000000000', name: 'Vendor B', upiId: 'vendorB@upi', paymentDisplayName: 'Vendor B Market', paymentInstructions: 'Pay directly to Vendor B UPI.' } }),
  ]);
  await prisma.vendorUser.upsert({ where: { userId_vendorId: { userId: vendorAAdmin.id, vendorId: vendors[0].id } }, update: {}, create: { userId: vendorAAdmin.id, vendorId: vendors[0].id, capabilities: ['ADMIN'] } });
  await prisma.vendorUser.upsert({ where: { userId_vendorId: { userId: vendorBAdmin.id, vendorId: vendors[1].id } }, update: {}, create: { userId: vendorBAdmin.id, vendorId: vendors[1].id, capabilities: ['ADMIN'] } });
  await prisma.vendorUser.upsert({ where: { userId_vendorId: { userId: deliveryA.id, vendorId: vendors[0].id } }, update: { capabilities: ['DELIVERY', 'PAYMENT_COLLECTION'] }, create: { userId: deliveryA.id, vendorId: vendors[0].id, capabilities: ['DELIVERY', 'PAYMENT_COLLECTION'] } });

  const shop = await prisma.shop.findFirst({ where: { isActive: true } }) ?? await prisma.shop.create({ data: { name: 'Local Marketplace Customer', primaryMobile: '9999999999' } });
  const branch = await prisma.branch.findFirst({ where: { isActive: true } }) ?? await prisma.branch.create({ data: { name: 'Main Branch', code: 'MAIN' } });
  await prisma.warehouse.upsert({ where: { code: 'MAIN-WH' }, update: { branchId: branch.id, isActive: true }, create: { branchId: branch.id, name: 'Main Warehouse', code: 'MAIN-WH' } });
  const category = await prisma.category.upsert({ where: { name: 'Fresh Foods' }, update: {}, create: { name: 'Fresh Foods' } });
  const kg = await prisma.unit.findUniqueOrThrow({ where: { code: 'KG' } });
  for (const [vendor, name, sku, price] of [[vendors[0], 'Fresh Chicken', 'LOCAL-CHICKEN-A', 280], [vendors[1], 'Fresh Mutton', 'LOCAL-MUTTON-B', 720]] as const) {
    const product = await prisma.product.upsert({ where: { sku }, update: { vendorId: vendor.id, status: 'ACTIVE', name }, create: { categoryId: category.id, unitId: kg.id, vendorId: vendor.id, name, sku, description: `Seed product from ${vendor.name}` } });
    const existingPrice = await prisma.productPrice.findFirst({ where: { productId: product.id, shopId: null } });
    if (existingPrice) await prisma.productPrice.update({ where: { id: existingPrice.id }, data: { price, validFrom: new Date() } });
    else await prisma.productPrice.create({ data: { productId: product.id, price, validFrom: new Date() } });
  }

  console.log('FarmMitra seed completed successfully.');
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });