import type { IncomingMessage, ServerResponse } from 'node:http';
import { Prisma, type PrismaClient } from '@farmmitra/database';
import { authenticate, hashPassword, HttpError, isDeliveryRole, isVendorRole, requirePermission, signAccessToken, verifyPassword } from './auth.js';
import { audit } from './audit.js';
import { pathParts, readJson, sendJson } from './http.js';
import { addressSchema, adminVendorCreateSchema, assignmentSchema, categorySchema, contactSchema, creditSchema, farmerCreateSchema, farmerUpdateSchema, inventoryAdjustmentSchema, inventoryIssueSchema, inventoryReceiptSchema, inventoryTransferSchema, loginSchema, parse, priceSchema, productSchema, productUpdateSchema, quantitySchema, registerSchema, shopSchema, shopUserSchema, unitSchema, userCreateSchema, userUpdateSchema, variantSchema, warehouseSchema, roleSchema, vendorSchema, vendorSettingsSchema, vendorStatusSchema, marketplaceOrderSchema, paymentCollectionSchema, customerAddressSchema, deliveryCompletionSchema, deliveryPartnerSchema, deliveryPartnerUpdateSchema } from './schemas.js';
import { DEFAULT_ORDER_CUTOFF, DEFAULT_ORDER_TIMEZONE, ORDER_STATUSES, calculateDeliveryDate, deriveDeliveryStatus, hashRequestPayload, isValidStatusTransition, orderSchema, parseRequestedDeliveryDate, quantityValidationError, type QuantityChange } from './orders.js';
import { calculateAvailableQuantity, isReservationActionAllowed, parseDecimalQuantity } from './inventory.js';
import { buildPaymentSummary } from './payment-summary.js';

const body = async <T>(request: IncomingMessage, schema: { parse(value: unknown): T }): Promise<T> => {
  try {
    return schema.parse(await readJson(request));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid request');
  }
};

const idFrom = (parts: string[], index: number): string => {
  const value = parts[index];
  if (!value) throw new HttpError(400, 'Resource id is required');
  return value;
};

const publicUser = (user: { id: string; name: string; email: string | null; mobile: string | null; preferredLanguage: string; status: string; roles?: { role: { name: string } }[] }) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  mobile: user.mobile,
  preferredLanguage: user.preferredLanguage,
  status: user.status,
  roles: user.roles?.map(({ role }) => role.name) ?? [],
});

const authAndPermission = async (request: IncomingMessage, database: PrismaClient, permission: string) => {
  const context = await authenticate(request, database);
  requirePermission(context, permission);
  return context;
};

const isAdminLike = (roles: string[]): boolean => roles.some((role) => ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(role));

const isVendorOperational = (vendor: { status?: string; isActive?: boolean }): boolean => vendor.status === 'APPROVED' && vendor.isActive !== false;

const vendorSetup = (vendor: { name: string; address?: string | null; contactPhone?: string | null; contactEmail?: string | null; upiId?: string | null; paymentInstructions?: string | null; products?: unknown[]; users?: Array<{ isActive: boolean; capabilities: unknown }> }) => {
  const checks = {
    businessProfile: Boolean(vendor.name && (vendor.contactPhone || vendor.contactEmail)),
    address: Boolean(vendor.address),
    paymentSettings: Boolean(vendor.upiId || vendor.paymentInstructions),
    firstProduct: Boolean(vendor.products?.length),
    deliverySetup: Boolean(vendor.users?.some((user) => user.isActive && Array.isArray(user.capabilities) && user.capabilities.includes('DELIVERY'))),
  };
  return { checks, complete: Object.values(checks).every(Boolean) };
};

const ensureShopAccess = async (context: Awaited<ReturnType<typeof authenticate>>, database: PrismaClient, shopId: string): Promise<void> => {
  if (isAdminLike(context.roles)) return;
  const access = await database.shopUser.findUnique({ where: { userId_shopId: { userId: context.userId, shopId } } });
  if (!access) throw new HttpError(403, 'Order is not accessible to this user');
};

const vendorIdForContext = async (context: Awaited<ReturnType<typeof authenticate>>, database: PrismaClient): Promise<string | undefined> => {
  if (context.roles.includes('SUPER_ADMIN') || context.roles.includes('ADMIN')) return undefined;
  if (isDeliveryRole(context.roles)) return undefined;
  if (!isVendorRole(context.roles)) throw new HttpError(403, 'Vendor access is required');
  const access = await database.vendorUser.findFirst({ where: { userId: context.userId, isActive: true }, include: { vendor: { select: { id: true, status: true, isActive: true } } } });
  if (!access) throw new HttpError(403, 'Vendor access is required');
  if (access.vendor && !isVendorOperational(access.vendor)) throw new HttpError(403, 'Vendor account is not approved for operations');
  return access.vendor?.id ?? access.vendorId;
};

const ensureAssignedDelivery = async (database: PrismaClient, orderId: string, userId: string) => {
  const delivery = await database.delivery.findFirst({ where: { orderId, assignments: { some: { userId } } }, include: { order: { include: { vendor: true, items: true, payments: true } }, assignments: true } });
  if (!delivery) throw new HttpError(403, 'This delivery is not assigned to you');
  return delivery;
};

const getIdempotencyKey = (request: IncomingMessage): string | undefined => {
  const idemHeader = request.headers['idempotency-key'] ?? request.headers['Idempotency-Key'];
  const key = typeof idemHeader === 'string' ? idemHeader.trim() : Array.isArray(idemHeader) ? idemHeader[0]?.trim() : undefined;
  return key && key.length > 0 ? key : undefined;
};

const assertInventoryIdempotency = async (database: PrismaClient, request: IncomingMessage, context: Awaited<ReturnType<typeof authenticate>>, payload: unknown): Promise<undefined | { idempotent: true }> => {
  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) return undefined;
  const requestHash = hashRequestPayload(payload);
  const existingKey = await database.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
  if (!existingKey) {
    await database.idempotencyKey.create({ data: { key: idempotencyKey, userId: context.userId, requestHash } });
    return undefined;
  }
  if (existingKey.userId !== context.userId || existingKey.requestHash !== requestHash) {
    throw new HttpError(409, 'Idempotency key was already used with a different request');
  }
  return { idempotent: true };
};

export const handleApi = async (request: IncomingMessage, response: ServerResponse, database: PrismaClient): Promise<boolean> => {
  const parts = pathParts(request.url);
  if (parts[0] !== 'api' || parts[1] !== 'v1') return false;
  const method = request.method ?? 'GET';

  if (parts[2] === 'auth') {
    if (method === 'POST' && parts[3] === 'register') {
      const input = await body(request, registerSchema);
      if (!input.email && !input.mobile) throw new HttpError(400, 'Email or mobile is required');
      const existing = await database.user.findFirst({ where: { OR: [{ email: input.email ?? undefined }, { mobile: input.mobile ?? undefined }] } });
      if (existing) throw new HttpError(409, 'A user with that email or mobile already exists');
      const role = await database.role.upsert({ where: { name: 'CUSTOMER' }, update: {}, create: { name: 'CUSTOMER' } });
      const user = await database.user.create({ data: { name: input.name, email: input.email, mobile: input.mobile, preferredLanguage: input.preferredLanguage, passwordHash: await hashPassword(input.password), roles: { create: [{ roleId: role.id }] } }, include: { roles: { include: { role: true } } } });
      await audit(database, user.id, 'CREATE', 'User', user.id);
      const token = signAccessToken({ userId: user.id, roles: ['CUSTOMER'], permissions: [] });
      sendJson(response, 201, { user: publicUser(user), accessToken: token });
      return true;
    }
    if (method === 'POST' && parts[3] === 'login') {
      const input = await body(request, loginSchema);
      const user = await database.user.findFirst({ where: { OR: [{ email: input.identifier }, { mobile: input.identifier }] }, include: { roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } } } });
      if (!user || user.status !== 'ACTIVE' || !(await verifyPassword(input.password, user.passwordHash))) throw new HttpError(401, 'Invalid credentials');
      const roles = user.roles.map(({ role }) => role.name);
      const permissions = user.roles.flatMap(({ role }) => role.permissions.map(({ permission }) => permission.name));
      await audit(database, user.id, 'LOGIN', 'User', user.id);
      sendJson(response, 200, { user: publicUser(user), accessToken: signAccessToken({ userId: user.id, roles, permissions }) });
      return true;
    }
    if (method === 'GET' && parts[3] === 'me') {
      const context = await authenticate(request, database);
      const user = await database.user.findUnique({ where: { id: context.userId }, include: { roles: { include: { role: true } } } });
      if (!user) throw new HttpError(404, 'User not found');
      sendJson(response, 200, { user: publicUser(user), permissions: context.permissions });
      return true;
    }
    throw new HttpError(404, 'Auth route not found');
  }

  if (parts[2] === 'users') {
    if (method === 'GET' && parts.length === 3) {
      await authAndPermission(request, database, 'users.read');
      const users = await database.user.findMany({ orderBy: { createdAt: 'desc' }, include: { roles: { include: { role: true } } } });
      sendJson(response, 200, users.map(publicUser));
      return true;
    }
    if (method === 'POST' && parts.length === 3) {
      const context = await authAndPermission(request, database, 'users.create');
      const input = await body(request, userCreateSchema);
      if (input.roleNames.includes('SUPER_ADMIN') && !context.roles.includes('SUPER_ADMIN')) throw new HttpError(403, 'Only a super admin can assign SUPER_ADMIN');
      const roles = await database.role.findMany({ where: { name: { in: input.roleNames } } });
      if (roles.length !== input.roleNames.length) throw new HttpError(400, 'One or more roles do not exist');
      const user = await database.user.create({ data: { name: input.name, email: input.email, mobile: input.mobile, preferredLanguage: input.preferredLanguage, passwordHash: await hashPassword(input.password), roles: { create: roles.map((role) => ({ roleId: role.id })) } }, include: { roles: { include: { role: true } } } });
      await audit(database, context.userId, 'CREATE', 'User', user.id);
      sendJson(response, 201, publicUser(user));
      return true;
    }
    if (parts.length >= 4) {
      const userId = idFrom(parts, 3);
      const context = await authenticate(request, database);
      if (method === 'GET' && parts.length === 4) {
        requirePermission(context, 'users.read');
        const user = await database.user.findUnique({ where: { id: userId }, include: { roles: { include: { role: true } } } });
        if (!user) throw new HttpError(404, 'User not found');
        sendJson(response, 200, publicUser(user));
        return true;
      }
      if (method === 'PATCH' && parts.length === 4) {
        requirePermission(context, 'users.update');
        const input = await body(request, userUpdateSchema);
        const data = { ...input, passwordHash: input.password ? await hashPassword(input.password) : undefined };
        delete (data as { password?: string }).password;
        const user = await database.user.update({ where: { id: userId }, data, include: { roles: { include: { role: true } } } });
        await audit(database, context.userId, 'UPDATE', 'User', userId);
        sendJson(response, 200, publicUser(user));
        return true;
      }
      if (method === 'POST' && parts[4] === 'roles') {
        requirePermission(context, 'users.roles.assign');
        const input = await body(request, roleSchema);
        if (input.roleName === 'SUPER_ADMIN' && !context.roles.includes('SUPER_ADMIN')) throw new HttpError(403, 'Only a super admin can assign SUPER_ADMIN');
        const role = await database.role.findUnique({ where: { name: input.roleName } });
        if (!role) throw new HttpError(404, 'Role not found');
        await database.userRole.upsert({ where: { userId_roleId: { userId, roleId: role.id } }, update: {}, create: { userId, roleId: role.id } });
        await audit(database, context.userId, 'ASSIGN_ROLE', 'User', userId, { role: input.roleName });
        sendJson(response, 204, null);
        return true;
      }
      if (method === 'DELETE' && parts[4] === 'roles') {
        requirePermission(context, 'users.roles.assign');
        const input = await body(request, roleSchema);
        const role = await database.role.findUnique({ where: { name: input.roleName } });
        if (!role) throw new HttpError(404, 'Role not found');
        await database.userRole.delete({ where: { userId_roleId: { userId, roleId: role.id } } });
        await audit(database, context.userId, 'REMOVE_ROLE', 'User', userId, { role: input.roleName });
        sendJson(response, 204, null);
        return true;
      }
    }
    throw new HttpError(404, 'User route not found');
  }


  if (parts[2] === 'farmers') {
    if (method === 'GET' && parts.length === 3) {
      await authAndPermission(request, database, 'farmers.read');

      const farmers = await database.farmerProfile.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              mobile: true,
              status: true,
            },
          },
          farms: {
            select: {
              id: true,
              name: true,
              code: true,
              type: true,
              status: true,
            },
          },
        },
      });

      sendJson(response, 200, farmers);
      return true;
    }

    if (method === 'POST' && parts.length === 3) {
      const context = await authAndPermission(request, database, 'farmers.create');
      const input = await body(request, farmerCreateSchema);

      const user = await database.user.findUnique({
        where: { id: input.userId },
      });

      if (!user) {
        throw new HttpError(404, 'User not found');
      }

      const existingFarmer = await database.farmerProfile.findFirst({
        where: {
          OR: [
            { userId: input.userId },
            { farmerCode: input.farmerCode },
          ],
        },
      });

      if (existingFarmer) {
        if (existingFarmer.userId === input.userId) {
          throw new HttpError(409, 'This user is already registered as a farmer');
        }

        throw new HttpError(409, 'Farmer code already exists');
      }

      const farmer = await database.farmerProfile.create({
        data: input,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              mobile: true,
              status: true,
            },
          },
          farms: true,
        },
      });

      await audit(database, context.userId, 'CREATE', 'FarmerProfile', farmer.id);

      sendJson(response, 201, farmer);
      return true;
    }

    if (parts.length >= 4) {
      const farmerId = idFrom(parts, 3);
      const context = await authenticate(request, database);

      if (method === 'GET' && parts.length === 4) {
        requirePermission(context, 'farmers.read');

        const farmer = await database.farmerProfile.findUnique({
          where: { id: farmerId },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                mobile: true,
                status: true,
              },
            },
            farms: {
              orderBy: { createdAt: 'desc' },
            },
          },
        });

        if (!farmer) {
          throw new HttpError(404, 'Farmer not found');
        }

        sendJson(response, 200, farmer);
        return true;
      }
      if (method === 'PATCH' && parts.length === 4) {
        requirePermission(context, 'farmers.update');

        const input = await body(request, farmerUpdateSchema);

        if (input.farmerCode) {
          const existingCode = await database.farmerProfile.findFirst({
            where: {
              farmerCode: input.farmerCode,
              NOT: { id: farmerId },
            },
          });

          if (existingCode) {
            throw new HttpError(409, 'Farmer code already exists');
          }
        }

        let farmer;

        try {
          farmer = await database.farmerProfile.update({
            where: { id: farmerId },
            data: input,
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  mobile: true,
                  status: true,
                },
              },
              farms: true,
            },
          });
        } catch (error) {
          if (error instanceof Error && error.message.includes('Record to update not found')) {
            throw new HttpError(404, 'Farmer not found');
          }

          throw error;
        }

        await audit(database, context.userId, 'UPDATE', 'FarmerProfile', farmerId);

        sendJson(response, 200, farmer);
        return true;
      }
    }

    throw new HttpError(404, 'Farmer route not found');
  }
  if (parts[2] === 'shops') {
    if (method === 'GET' && parts.length === 3) {
      await authAndPermission(request, database, 'shops.read');
      sendJson(response, 200, await database.shop.findMany({ orderBy: { createdAt: 'desc' }, include: { contacts: true, addresses: true, creditAccount: true } }));
      return true;
    }
    if (method === 'POST' && parts.length === 3) {
      const context = await authAndPermission(request, database, 'shops.create');
      const input = await body(request, shopSchema);
      const shop = await database.shop.create({ data: input });
      await audit(database, context.userId, 'CREATE', 'Shop', shop.id);
      sendJson(response, 201, shop);
      return true;
    }
    if (parts.length >= 4) {
      const shopId = idFrom(parts, 3);
      const context = await authenticate(request, database);
      if (method === 'GET' && parts.length === 4) {
        requirePermission(context, 'shops.read');
        const shop = await database.shop.findUnique({ where: { id: shopId }, include: { contacts: true, addresses: true, creditAccount: true } });
        if (!shop) throw new HttpError(404, 'Shop not found');
        sendJson(response, 200, shop);
        return true;
      }
      if (method === 'POST' && parts[4] === 'users') {
        requirePermission(context, 'shops.update');
        const input = await body(request, shopUserSchema);
        const shop = await database.shop.findUnique({ where: { id: shopId } });
        const user = await database.user.findUnique({ where: { id: input.userId } });
        if (!shop || !user) throw new HttpError(404, 'Shop or user not found');
        const assignment = await database.shopUser.upsert({ where: { userId_shopId: { userId: input.userId, shopId } }, update: {}, create: { userId: input.userId, shopId } });
        await audit(database, context.userId, 'ASSIGN', 'ShopUser', `${input.userId}:${shopId}`);
        sendJson(response, 201, assignment);
        return true;
      }
      if (method === 'PATCH' && parts.length === 4) {
        requirePermission(context, 'shops.update');
        const shop = await database.shop.update({ where: { id: shopId }, data: await body(request, shopSchema) });
        await audit(database, context.userId, 'UPDATE', 'Shop', shopId);
        sendJson(response, 200, shop);
        return true;
      }
      if (method === 'POST' && parts[4] === 'contacts') {
        requirePermission(context, 'shops.update');
        const contact = await database.shopContact.create({ data: { shopId, ...(await body(request, contactSchema)) } });
        await audit(database, context.userId, 'CREATE', 'ShopContact', contact.id);
        sendJson(response, 201, contact);
        return true;
      }
      if (method === 'POST' && parts[4] === 'addresses') {
        requirePermission(context, 'shops.update');
        const address = await database.shopAddress.create({ data: { shopId, ...(await body(request, addressSchema)) } });
        await audit(database, context.userId, 'CREATE', 'ShopAddress', address.id);
        sendJson(response, 201, address);
        return true;
      }
      if (method === 'PUT' && parts[4] === 'credit') {
        requirePermission(context, 'shops.credit.manage');
        const input = await body(request, creditSchema);
        const credit = await database.shopCreditAccount.upsert({ where: { shopId }, update: input, create: { shopId, ...input } });
        await audit(database, context.userId, 'UPSERT', 'ShopCreditAccount', credit.id);
        sendJson(response, 200, credit);
        return true;
      }
    }
    throw new HttpError(404, 'Shop route not found');
  }

  if (parts[2] === 'marketplace') {
    if (method === 'GET' && parts[3] === 'me' && parts.length === 4) {
      const context = await authenticate(request, database);
      const access = await database.vendorUser.findFirst({ where: { userId: context.userId, isActive: true }, include: { vendor: { include: { products: { where: { status: 'ACTIVE' }, select: { id: true } }, users: { select: { isActive: true, capabilities: true } } } } } });
      const vendor = access?.vendor ?? null;
      sendJson(response, 200, { userId: context.userId, roles: context.roles, vendor: vendor ? { ...vendor, setup: vendorSetup(vendor) } : null, capabilities: access?.capabilities ?? [] });
      return true;
    }

    if (parts[3] === 'admin') {
      const context = await authAndPermission(request, database, 'vendors.manage');
      if (!context.roles.includes('SUPER_ADMIN') && !context.roles.includes('ADMIN')) throw new HttpError(403, 'Super admin access is required');
      if (method === 'GET' && parts[4] === 'vendors' && parts.length === 5) {
        const query = new URL(request.url ?? '/', 'http://localhost');
        const search = query.searchParams.get('search')?.trim();
        const status = query.searchParams.get('status');
        const vendors = await database.vendor.findMany({ where: { ...(status ? { status: status as never } : {}), ...(search ? { OR: [{ name: { contains: search } }, { contactEmail: { contains: search } }, { contactPhone: { contains: search } }] } : {}) }, include: { products: { where: { status: 'ACTIVE' }, select: { id: true } }, users: { select: { isActive: true, capabilities: true } }, _count: { select: { products: true, orders: true, users: true } } }, orderBy: { createdAt: 'desc' } });
        sendJson(response, 200, vendors.map((vendor) => ({ ...vendor, setup: vendorSetup(vendor) })));
        return true;
      }
      if (method === 'POST' && parts[4] === 'vendors' && parts.length === 5) {
        const input = await body(request, adminVendorCreateSchema);
        const duplicate = await database.user.findFirst({ where: { OR: [{ email: input.email }, { mobile: input.phone }] }, select: { id: true } });
        if (duplicate) throw new HttpError(409, 'An account with that email or phone already exists');
        const role = await database.role.findUnique({ where: { name: 'VENDOR' } });
        if (!role) throw new HttpError(500, 'Vendor role is not configured');
        const created = await database.$transaction(async (tx) => {
          const user = await tx.user.create({ data: { name: input.ownerName, email: input.email, mobile: input.phone, passwordHash: await hashPassword(input.password), roles: { create: [{ roleId: role.id }] } } });
          const vendor = await tx.vendor.create({ data: { name: input.businessName, contactEmail: input.email, contactPhone: input.phone, address: input.address, isActive: false, status: 'PENDING' } });
          await tx.vendorUser.create({ data: { userId: user.id, vendorId: vendor.id, capabilities: ['ADMIN'] } });
          return { vendor, user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile } };
        });
        await audit(database, context.userId, 'CREATE', 'Vendor', created.vendor.id, { ownerUserId: created.user.id, status: 'PENDING' });
        sendJson(response, 201, created);
        return true;
      }
      if (parts[4] === 'vendors' && parts.length === 6) {
        const vendorId = idFrom(parts, 5);
        const vendor = await database.vendor.findUnique({ where: { id: vendorId }, include: { products: { where: { status: 'ACTIVE' }, select: { id: true } }, users: { select: { isActive: true, capabilities: true } }, _count: { select: { products: true, orders: true, users: true } } } });
        if (!vendor) throw new HttpError(404, 'Vendor not found');
        if (method === 'GET') {
          sendJson(response, 200, { ...vendor, setup: vendorSetup(vendor) });
          return true;
        }
      }
      if (method === 'PATCH' && parts[4] === 'vendors' && parts.length === 7 && parts[6] === 'status') {
        const vendorId = idFrom(parts, 5);
        const vendor = await database.vendor.findUnique({ where: { id: vendorId } });
        if (!vendor) throw new HttpError(404, 'Vendor not found');
        const input = await body(request, vendorStatusSchema);
        if (vendor.status === input.status) throw new HttpError(400, 'Vendor is already in that status');
        const validTransition = (vendor.status === 'PENDING' && ['APPROVED', 'SUSPENDED'].includes(input.status)) || (vendor.status === 'APPROVED' && input.status === 'SUSPENDED') || (vendor.status === 'SUSPENDED' && input.status === 'APPROVED');
        if (!validTransition) throw new HttpError(400, 'Invalid vendor status transition');
        const updated = await database.vendor.update({ where: { id: vendorId }, data: { status: input.status as never, isActive: input.status === 'APPROVED' } });
        await audit(database, context.userId, 'UPDATE', 'Vendor', vendorId, { previousStatus: vendor.status, status: input.status });
        sendJson(response, 200, updated);
        return true;
      }
      if (method === 'GET' && parts[4] === 'master-orders' && parts.length === 5) {
        sendJson(response, 200, await database.masterOrder.findMany({ include: { customer: true, subOrders: { include: { vendor: true, payments: true, deliveries: true } } }, orderBy: { createdAt: 'desc' } }));
        return true;
      }
      if (method === 'GET' && parts[4] === 'delivery-partners' && parts.length === 5) {
        sendJson(response, 200, await database.vendorUser.findMany({ include: { vendor: true, user: true }, orderBy: { assignedAt: 'desc' } }));
        return true;
      }
      if (method === 'GET' && parts[4] === 'payments' && parts.length === 5) {
        sendJson(response, 200, await database.payment.findMany({ include: { vendor: true, order: true, receivedBy: true, deliveryPartner: true }, orderBy: { receivedAt: 'desc' } }));
        return true;
      }
    }

    if (parts[3] === 'delivery' && ['dashboard', 'payments', 'history', 'outstanding'].includes(parts[4] ?? '') && parts.length === 5) {
      const context = await authenticate(request, database);
      if (!isDeliveryRole(context.roles) && !context.roles.includes('SUPER_ADMIN')) throw new HttpError(403, 'Delivery partner access is required');
      const deliveries = await database.delivery.findMany({ where: context.roles.includes('SUPER_ADMIN') ? {} : { assignments: { some: { userId: context.userId } } }, include: { order: { include: { vendor: true, items: true, payments: true } }, assignments: { include: { user: true } } }, orderBy: { scheduledAt: 'asc' } });
      const payments = await database.payment.findMany({ where: context.roles.includes('SUPER_ADMIN') ? {} : { deliveryPartnerId: context.userId }, include: { order: true, vendor: true, deliveryPartner: true }, orderBy: { receivedAt: 'desc' } });
      const summaries = deliveries.map((delivery) => ({ ...delivery, paymentSummary: buildPaymentSummary(delivery.order.totalAmount, delivery.order.payments, delivery.order.orderDate) }));
      if (parts[4] === 'payments') {
        sendJson(response, 200, { payments, totals: payments.reduce((result, payment) => { if (!payment.status || !['COMPLETED', 'CASH_COLLECTED', 'UPI_COLLECTED'].includes(payment.status)) return result; result.total += Number(payment.amount); if (payment.method === 'CASH') result.cash += Number(payment.amount); if (payment.method === 'UPI') result.upi += Number(payment.amount); return result; }, { total: 0, cash: 0, upi: 0 }) });
        return true;
      }
      if (parts[4] === 'outstanding') {
        sendJson(response, 200, summaries.filter((delivery) => delivery.paymentSummary.outstanding > 0));
        return true;
      }
      if (parts[4] === 'history') {
        sendJson(response, 200, summaries);
        return true;
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayPayments = payments.filter((payment) => payment.receivedAt && new Date(payment.receivedAt) >= today);
      sendJson(response, 200, {
        deliveries: summaries,
        today: {
          assigned: summaries.length,
          pending: summaries.filter((delivery) => delivery.order.status !== 'DELIVERED').length,
          completed: summaries.filter((delivery) => delivery.order.status === 'DELIVERED').length,
          collected: todayPayments.reduce((sum, payment) => sum + Number(payment.amount), 0),
          cash: todayPayments.filter((payment) => payment.method === 'CASH').reduce((sum, payment) => sum + Number(payment.amount), 0),
          upi: todayPayments.filter((payment) => payment.method === 'UPI').reduce((sum, payment) => sum + Number(payment.amount), 0),
          outstanding: summaries.reduce((sum, delivery) => sum + delivery.paymentSummary.outstanding, 0),
        },
      });
      return true;
    }

    if (parts[3] === 'addresses') {
      const context = await authenticate(request, database);
      if (method === 'GET' && parts.length === 4) {
        sendJson(response, 200, await database.customerAddress.findMany({ where: { userId: context.userId }, orderBy: { createdAt: 'desc' } }));
        return true;
      }
      if (method === 'POST' && parts.length === 4) {
        const address = await database.customerAddress.create({ data: { userId: context.userId, ...(await body(request, customerAddressSchema)) } });
        sendJson(response, 201, address);
        return true;
      }
      if (parts.length === 5 && (method === 'PATCH' || method === 'DELETE')) {
        const addressId = idFrom(parts, 4);
        const existing = await database.customerAddress.findFirst({ where: { id: addressId, userId: context.userId } });
        if (!existing) throw new HttpError(404, 'Address not found');
        if (method === 'DELETE') {
          await database.customerAddress.delete({ where: { id: addressId } });
          sendJson(response, 204, null);
          return true;
        }
        sendJson(response, 200, await database.customerAddress.update({ where: { id: addressId }, data: await body(request, customerAddressSchema) }));
        return true;
      }
    }

    if (parts[3] === 'master-orders') {
      const context = await authenticate(request, database);
      if (method === 'GET' && parts.length === 4) {
        sendJson(response, 200, await database.masterOrder.findMany({ where: { customerId: context.userId }, include: { subOrders: { include: { vendor: true, items: true, payments: true, deliveries: { include: { assignments: { include: { user: true } } } } } } }, orderBy: { createdAt: 'desc' } }));
        return true;
      }
      if (method === 'GET' && parts.length === 5) {
        const master = await database.masterOrder.findFirst({ where: { id: idFrom(parts, 4), customerId: context.userId }, include: { subOrders: { include: { vendor: true, items: true, payments: { include: { receivedBy: true } }, deliveries: { include: { assignments: { include: { user: true } } } } } } } });
        if (!master) throw new HttpError(404, 'Master order not found');
        sendJson(response, 200, master);
        return true;
      }
    }

    if (parts[3] === 'delivery' && parts[4] === 'orders') {
      const context = await authenticate(request, database);
      if (!isDeliveryRole(context.roles) && !context.roles.includes('SUPER_ADMIN')) throw new HttpError(403, 'Delivery partner access is required');
      if (method === 'GET' && parts.length === 5) {
        const deliveries = await database.delivery.findMany({ where: context.roles.includes('SUPER_ADMIN') ? {} : { assignments: { some: { userId: context.userId } } }, include: { order: { include: { vendor: true, items: true, payments: true } }, assignments: { include: { user: true } } }, orderBy: { scheduledAt: 'asc' } });
        sendJson(response, 200, deliveries);
        return true;
      }
      if (parts.length >= 6) {
        const delivery = await ensureAssignedDelivery(database, idFrom(parts, 5), context.userId);
        if (method === 'GET' && parts.length === 6) {
          sendJson(response, 200, delivery);
          return true;
        }
        if (method === 'POST' && parts.length === 7) {
          const action = parts[6];
          const assignment = delivery.assignments.find((item) => item.userId === context.userId);
          if (action === 'accept') {
            if (!assignment) throw new HttpError(403, 'This delivery is not assigned to you');
            const updated = await database.deliveryAssignment.updateMany({ where: { deliveryId: delivery.id, userId: context.userId }, data: { status: 'ACCEPTED' } });
            sendJson(response, 200, updated);
            return true;
          }
          if (action === 'start') {
            if (assignment?.status !== 'ACCEPTED' && assignment?.status !== 'IN_PROGRESS') throw new HttpError(400, 'Accept the delivery before starting it');
            if (delivery.order.status !== 'ASSIGNED') throw new HttpError(400, 'Order is not ready for delivery');
            await database.$transaction([
              database.deliveryAssignment.updateMany({ where: { deliveryId: delivery.id, userId: context.userId }, data: { status: 'IN_PROGRESS' } }),
              database.delivery.update({ where: { id: delivery.id }, data: { status: 'OUT_FOR_DELIVERY' } }),
              database.order.update({ where: { id: delivery.orderId }, data: { status: 'OUT_FOR_DELIVERY', statusHistory: { create: [{ previousStatus: delivery.order.status, newStatus: 'OUT_FOR_DELIVERY', changedBy: context.userId, reason: 'DELIVERY_STARTED' }] } } }),
            ]);
            sendJson(response, 200, { status: 'OUT_FOR_DELIVERY' });
            return true;
          }
          if (action === 'complete') {
            const input = await body(request, deliveryCompletionSchema);
            const partnerAccess = await database.vendorUser.findUnique({ where: { userId_vendorId: { userId: context.userId, vendorId: delivery.order.vendorId! } } });
            const capabilities = Array.isArray(partnerAccess?.capabilities) ? partnerAccess.capabilities : [];
            if ((input.payment === 'CASH' || input.payment === 'UPI') && !context.roles.includes('SUPER_ADMIN') && !capabilities.includes('PAYMENT_COLLECTION')) throw new HttpError(403, 'Payment collection capability is required');
            if (delivery.order.status !== 'OUT_FOR_DELIVERY') throw new HttpError(400, 'Order is not out for delivery');
            if (input.payment === 'UPI' && !input.referenceNumber) throw new HttpError(400, 'UPI reference number is required');
            const paymentSummary = buildPaymentSummary(delivery.order.totalAmount, delivery.order.payments, delivery.order.orderDate);
            const amount = Number(input.amount ?? paymentSummary.outstanding);
            if ((input.payment === 'CASH' || input.payment === 'UPI') && amount > paymentSummary.outstanding) throw new HttpError(400, 'Collected amount cannot exceed the outstanding balance');
            if ((input.payment === 'CASH' || input.payment === 'UPI') && amount <= 0) throw new HttpError(400, 'Collected amount must be greater than zero');
            const result = await database.$transaction(async (tx) => {
              if (input.payment === 'CASH' || input.payment === 'UPI') await tx.payment.create({ data: { shopId: delivery.order.shopId, orderId: delivery.orderId, vendorId: delivery.order.vendorId, amount, method: input.payment, status: input.payment === 'CASH' ? 'CASH_COLLECTED' : 'UPI_COLLECTED', referenceNumber: input.referenceNumber, paidAt: new Date(), receivedAt: new Date(), receivedByUserId: context.userId, deliveryPartnerId: context.userId, notes: input.notes } });
              const updatedDelivery = await tx.delivery.update({ where: { id: delivery.id }, data: { status: 'DELIVERED', deliveredAt: new Date(), deliveredByUserId: context.userId, deliveryNotes: input.notes } });
              const updatedOrder = await tx.order.update({ where: { id: delivery.orderId }, data: { status: 'DELIVERED', deliveredAt: new Date(), statusHistory: { create: [{ previousStatus: delivery.order.status, newStatus: 'DELIVERED', changedBy: context.userId, reason: 'DELIVERY_COMPLETED' }] } } });
              return { delivery: updatedDelivery, order: updatedOrder };
            });
            sendJson(response, 200, result);
            return true;
          }
        }
      }
    }

    if (method === 'GET' && parts[3] === 'products' && parts.length === 4) {
      const query = new URL(request.url ?? '/', 'http://localhost');
      const search = query.searchParams.get('search')?.trim();
      const products = await database.product.findMany({
        where: { status: 'ACTIVE', vendor: { is: { isActive: true, status: 'APPROVED' } }, ...(search ? { OR: [{ name: { contains: search } }, { description: { contains: search } }] } : {}) },
        include: { vendor: true, category: true, unit: true, prices: { where: { shopId: null }, orderBy: { validFrom: 'desc' }, take: 1 } },
        orderBy: { name: 'asc' },
      });
      const productsWithPrices = await Promise.all(products.map(async (product) => ({ ...product, price: (await database.productPrice.findFirst({ where: { productId: product.id, shopId: null }, orderBy: { validFrom: 'desc' } }))?.price ?? null })));
      sendJson(response, 200, productsWithPrices);
      return true;
    }

    if (method === 'GET' && parts[3] === 'vendors' && parts.length === 4) {
      sendJson(response, 200, await database.vendor.findMany({ where: { isActive: true, status: 'APPROVED' }, orderBy: { name: 'asc' } }));
      return true;
    }

    if (method === 'POST' && parts[3] === 'vendors' && parts.length === 4) {
      const context = await authAndPermission(request, database, 'vendors.manage');
      const vendor = await database.vendor.create({ data: await body(request, vendorSchema) });
      await audit(database, context.userId, 'CREATE', 'Vendor', vendor.id);
      sendJson(response, 201, vendor);
      return true;
    }

    if (parts[3] === 'vendors' && parts.length >= 5) {
      const vendorId = idFrom(parts, 4);
      const context = await authenticate(request, database);
      const scopedVendorId = await vendorIdForContext(context, database);
      if (scopedVendorId && scopedVendorId !== vendorId) throw new HttpError(403, 'Vendor is outside your scope');
      if (method === 'GET' && parts[5] === 'products' && parts.length === 6) {
        sendJson(response, 200, await database.product.findMany({ where: { vendorId }, include: { category: true, unit: true, prices: { where: { shopId: null }, orderBy: { validFrom: 'desc' }, take: 1 } }, orderBy: { name: 'asc' } }));
        return true;
      }
      if (method === 'PATCH' && parts[5] === 'products' && parts.length === 7) {
        const productId = idFrom(parts, 6);
        const product = await database.product.findFirst({ where: { id: productId, vendorId } });
        if (!product) throw new HttpError(404, 'Product not found');
        const input = await body(request, productUpdateSchema);
        if (Object.keys(input).length === 0) throw new HttpError(400, 'Product update is required');
        sendJson(response, 200, await database.product.update({ where: { id: productId }, data: input }));
        return true;
      }
      if (method === 'POST' && parts[5] === 'products' && parts.length === 6) {
        const product = await database.product.create({ data: { ...(await body(request, productSchema)), vendorId } });
        await audit(database, context.userId, 'CREATE', 'Product', product.id, { vendorId });
        sendJson(response, 201, product);
        return true;
      }
      if (method === 'GET' && parts[5] === 'orders' && parts.length === 6) {
        sendJson(response, 200, await database.order.findMany({ where: { vendorId }, include: { items: true, payments: true, deliveries: { include: { assignments: { include: { user: true } } } } }, orderBy: { createdAt: 'desc' } }));
        return true;
      }
      if (method === 'GET' && parts[5] === 'delivery-partners' && parts.length === 6) {
        sendJson(response, 200, await database.vendorUser.findMany({ where: { vendorId }, include: { user: { include: { roles: { include: { role: true } } } } } }));
        return true;
      }
      if (parts[5] === 'delivery-partners' && parts.length === 7) {
        const partnerId = idFrom(parts, 6);
        const existing = await database.vendorUser.findUnique({ where: { userId_vendorId: { userId: partnerId, vendorId } }, include: { user: true, vendor: true } });
        if (!existing) throw new HttpError(404, 'Delivery partner not found');
        if (method === 'GET') {
          sendJson(response, 200, existing);
          return true;
        }
        if (method === 'PATCH') {
          const input = await body(request, deliveryPartnerUpdateSchema);
          const updated = await database.vendorUser.update({ where: { userId_vendorId: { userId: partnerId, vendorId } }, data: input, include: { user: true, vendor: true } });
          sendJson(response, 200, updated);
          return true;
        }
        if (method === 'DELETE') {
          const updated = await database.vendorUser.update({ where: { userId_vendorId: { userId: partnerId, vendorId } }, data: { isActive: false }, include: { user: true, vendor: true } });
          sendJson(response, 200, updated);
          return true;
        }
      }
      if (method === 'POST' && parts[5] === 'delivery-partners' && parts.length === 6) {
        const input = await body(request, deliveryPartnerSchema);
        const user = await database.user.findUnique({ where: { id: input.userId }, include: { roles: { include: { role: true } } } });
        if (!user || user.status !== 'ACTIVE') throw new HttpError(404, 'Active user not found');
        if (!user.roles.some(({ role }) => ['DELIVERY_PARTNER', 'DELIVERY_STAFF'].includes(role.name))) throw new HttpError(400, 'User is not a delivery partner');
        sendJson(response, 201, await database.vendorUser.upsert({ where: { userId_vendorId: { userId: input.userId, vendorId } }, update: { capabilities: input.capabilities, isActive: true }, create: { userId: input.userId, vendorId, capabilities: input.capabilities } }));
        return true;
      }
      if (method === 'GET' && parts[5] === 'payments' && parts.length === 6) {
        sendJson(response, 200, await database.payment.findMany({ where: { vendorId }, include: { order: true, receivedBy: true, deliveryPartner: true }, orderBy: { receivedAt: 'desc' } }));
        return true;
      }
      if (method === 'GET' && parts[5] === 'payment-settings' && parts.length === 6) {
        sendJson(response, 200, await database.vendor.findUnique({ where: { id: vendorId }, select: { id: true, name: true, imageUrl: true, contactPhone: true, contactEmail: true, address: true, upiId: true, paymentDisplayName: true, qrImageUrl: true, cashCollectionEnabled: true, upiCollectionEnabled: true, paymentInstructions: true } }));
        return true;
      }
      if (method === 'PATCH' && parts[5] === 'payment-settings' && parts.length === 6) {
        const settings = await body(request, vendorSettingsSchema);
        sendJson(response, 200, await database.vendor.update({ where: { id: vendorId }, data: settings, select: { id: true, name: true, imageUrl: true, contactPhone: true, contactEmail: true, address: true, upiId: true, paymentDisplayName: true, qrImageUrl: true, cashCollectionEnabled: true, upiCollectionEnabled: true, paymentInstructions: true } }));
        return true;
      }
      if (parts[5] === 'collections' && parts.length === 6 && method === 'GET') {
        const payments = await database.payment.findMany({ where: { vendorId }, include: { order: true, deliveryPartner: true, receivedBy: true }, orderBy: { receivedAt: 'desc' } });
        sendJson(response, 200, { payments, totals: payments.reduce((result, payment) => { if (!['COMPLETED', 'CASH_COLLECTED', 'UPI_COLLECTED'].includes(payment.status)) return result; result.total += Number(payment.amount); if (payment.method === 'CASH') result.cash += Number(payment.amount); if (payment.method === 'UPI') result.upi += Number(payment.amount); return result; }, { total: 0, cash: 0, upi: 0 }) });
        return true;
      }
      if ((parts[5] === 'outstanding' || parts[5] === 'delivery-dashboard') && parts.length === 6 && method === 'GET') {
        const orders = await database.order.findMany({ where: { vendorId }, include: { payments: true, deliveries: { include: { assignments: { include: { user: true } } } }, items: true }, orderBy: { createdAt: 'desc' } });
        const summaries = orders.map((vendorOrder) => ({ ...vendorOrder, paymentSummary: buildPaymentSummary(vendorOrder.totalAmount, vendorOrder.payments, vendorOrder.orderDate) }));
        if (parts[5] === 'outstanding') {
          sendJson(response, 200, summaries.filter((vendorOrder) => vendorOrder.paymentSummary.outstanding > 0));
          return true;
        }
        const partnerSummary = new Map<string, { userId: string; name: string; deliveries: number; collected: number; cash: number; upi: number }>();
        for (const vendorOrder of summaries) for (const delivery of vendorOrder.deliveries) for (const assignment of delivery.assignments) {
          const current = partnerSummary.get(assignment.userId) ?? { userId: assignment.userId, name: assignment.user.name, deliveries: 0, collected: 0, cash: 0, upi: 0 };
          current.deliveries += 1;
          current.collected += vendorOrder.paymentSummary.collected;
          current.cash += vendorOrder.paymentSummary.cashCollected;
          current.upi += vendorOrder.paymentSummary.upiCollected;
          partnerSummary.set(assignment.userId, current);
        }
        sendJson(response, 200, { orders: summaries, partners: Array.from(partnerSummary.values()), totals: { deliveries: summaries.length, pending: summaries.filter((vendorOrder) => vendorOrder.status !== 'DELIVERED').length, delivered: summaries.filter((vendorOrder) => vendorOrder.status === 'DELIVERED').length, collected: summaries.reduce((sum, vendorOrder) => sum + vendorOrder.paymentSummary.collected, 0), cash: summaries.reduce((sum, vendorOrder) => sum + vendorOrder.paymentSummary.cashCollected, 0), upi: summaries.reduce((sum, vendorOrder) => sum + vendorOrder.paymentSummary.upiCollected, 0), outstanding: summaries.reduce((sum, vendorOrder) => sum + vendorOrder.paymentSummary.outstanding, 0), overdue: summaries.filter((vendorOrder) => vendorOrder.paymentSummary.overdue).length } });
        return true;
      }
    }

    if (method === 'POST' && parts[3] === 'orders' && parts.length === 4) {
      const context = await authenticate(request, database);
      const input = await body(request, marketplaceOrderSchema);
      const idempotencyKey = getIdempotencyKey(request);
      const requestHash = hashRequestPayload(input);
      if (idempotencyKey) {
        const existingKey = await database.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
        if (existingKey && (existingKey.userId !== context.userId || existingKey.requestHash !== requestHash)) {
          throw new HttpError(409, 'Idempotency key was already used with a different request');
        }
        if (existingKey?.orderId) {
          const existingOrder = await database.order.findUnique({ where: { id: existingKey.orderId }, include: { masterOrder: { include: { subOrders: { include: { vendor: true, items: true } } } } } });
          const existingMaster = existingOrder?.masterOrder;
          if (existingMaster) {
            sendJson(response, 200, existingMaster);
            return true;
          }
        }
        if (!existingKey) await database.idempotencyKey.create({ data: { key: idempotencyKey, userId: context.userId, requestHash } });
      }
      const fallbackShop = await database.shop.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
      const branch = await database.warehouse.findFirst({ where: { isActive: true }, select: { branchId: true } });
      if (!fallbackShop || !branch) throw new HttpError(400, 'Marketplace checkout is not configured');
      const selectedAddress = input.addressId
        ? await database.customerAddress.findFirst({ where: { id: input.addressId, userId: context.userId } })
        : input.deliveryAddress
          ? await database.customerAddress.create({ data: { userId: context.userId, ...input.deliveryAddress } })
          : null;
      if (input.addressId && !selectedAddress) throw new HttpError(404, 'Delivery address not found');
      if (!selectedAddress) throw new HttpError(400, 'A delivery address is required');
      const addressSnapshot = [selectedAddress.line1, selectedAddress.line2, selectedAddress.city, selectedAddress.state, selectedAddress.postalCode].filter(Boolean).join(', ');
      const grouped = new Map<string, Array<{ input: (typeof input.items)[number]; product: { id: string; unitId: string; name: string; sku: string; unit: { code: string } }; price: number }>>();
      for (const item of input.items) {
        const product = await database.product.findUnique({ where: { id: item.productId }, include: { unit: true, vendor: true } });
        if (!product || product.status !== 'ACTIVE' || !product.vendorId || !product.vendor?.isActive) throw new HttpError(400, `Product is unavailable: ${item.productId}`);
        const availableProduct = product;
        const price = await database.productPrice.findFirst({ where: { productId: item.productId, shopId: null }, orderBy: { validFrom: 'desc' } });
        if (!price) throw new HttpError(400, `Pricing is unavailable for ${product.name}`);
        const items = grouped.get(product.vendorId) ?? [];
        items.push({ input: item, product: availableProduct, price: Number(price.price) });
        grouped.set(product.vendorId, items);
      }
      const totalAmount = Array.from(grouped.values()).flat().reduce((sum, item) => sum + item.price * item.input.quantity, 0);
      const master = await database.$transaction(async (tx) => {
        const createdMaster = await tx.masterOrder.create({ data: { orderNumber: `FM-M-${Date.now()}`, customerId: context.userId, totalAmount, deliveryAddress: selectedAddress } });
        for (const [vendorId, items] of grouped) {
          const subtotal = items.reduce((sum, item) => sum + item.price * item.input.quantity, 0);
          await tx.order.create({
            data: {
              orderNumber: `FM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              shopId: fallbackShop.id,
              branchId: branch.branchId,
              vendorId,
              masterOrderId: createdMaster.id,
              customerId: context.userId,
              deliveryAddressSnapshot: addressSnapshot,
              status: 'PLACED',
              subtotal,
              totalAmount: subtotal,
              orderDate: new Date(),
              placedAt: new Date(),
              items: { create: items.map(({ input: item, product, price }) => ({ productId: product.id, unitId: item.unitId ?? product.unitId, productNameSnapshot: product.name, variantNameSnapshot: product.name, skuSnapshot: product.sku, unitSnapshot: product.unit.code, orderedQuantity: item.quantity, unitPrice: price, lineTotal: price * item.quantity, notes: item.notes })) },
              statusHistory: { create: [{ newStatus: 'PLACED', changedBy: context.userId, reason: 'MARKETPLACE_CHECKOUT' }] },
            },
          });
        }
        return tx.masterOrder.findUnique({ where: { id: createdMaster.id }, include: { subOrders: { include: { vendor: true, items: true } } } });
      });
      if (!master) throw new HttpError(500, 'Marketplace order could not be created');
      const firstSubOrder = master.subOrders[0];
      if (!firstSubOrder) throw new HttpError(500, 'Marketplace order has no vendor sub-orders');
      if (idempotencyKey) await database.idempotencyKey.update({ where: { key: idempotencyKey }, data: { orderId: firstSubOrder.id } });
      sendJson(response, 201, master);
      return true;
    }

    if (parts[3] === 'orders' && parts.length >= 5) {
      const orderId = idFrom(parts, 4);
      const context = await authenticate(request, database);
      const order = await database.order.findUnique({ where: { id: orderId }, include: { vendor: true, items: true, deliveries: { include: { assignments: true } }, payments: true } });
      if (!order?.vendorId) throw new HttpError(404, 'Marketplace order not found');
      const scopedVendorId = await vendorIdForContext(context, database);
      if (scopedVendorId && scopedVendorId !== order.vendorId) throw new HttpError(403, 'Order is outside your vendor scope');
      const isDeliveryActor = isDeliveryRole(context.roles);
      if (isDeliveryActor && !context.roles.includes('SUPER_ADMIN')) await ensureAssignedDelivery(database, orderId, context.userId);
      if (!scopedVendorId && !isDeliveryActor && !context.roles.includes('SUPER_ADMIN') && order.customerId !== context.userId) throw new HttpError(403, 'Order is not accessible to this user');

      if (method === 'POST' && parts[5] === 'status' && parts.length === 6) {
        const input = await body(request, { parse: (value: unknown) => ({ status: String((value as { status?: string }).status ?? '') }) });
        const allowed = ['CONFIRMED', 'PICKING', 'PACKED', 'CANCELLED'];
        if (!allowed.includes(input.status) || !isValidStatusTransition(order.status, input.status)) throw new HttpError(400, 'Invalid order status transition');
        const updated = await database.order.update({ where: { id: orderId }, data: { status: input.status as never, ...(input.status === 'CONFIRMED' ? { confirmedAt: new Date() } : {}), ...(input.status === 'PACKED' ? { packedAt: new Date() } : {}), statusHistory: { create: [{ previousStatus: order.status, newStatus: input.status as never, changedBy: context.userId, reason: 'VENDOR_STATUS_UPDATE' }] } } });
        sendJson(response, 200, updated);
        return true;
      }

      if (method === 'POST' && parts[5] === 'assignment' && parts.length === 6) {
        const input = await body(request, assignmentSchema);
        if (order.status !== 'PACKED') throw new HttpError(400, 'Order must be packed before assignment');
        const assignee = await database.vendorUser.findUnique({ where: { userId_vendorId: { userId: input.userId, vendorId: order.vendorId } }, include: { user: { include: { roles: { include: { role: true } } } } } });
        const capabilities = Array.isArray(assignee?.capabilities) ? assignee.capabilities : [];
        if (!assignee?.isActive || assignee.user.status !== 'ACTIVE' || (!assignee.user.roles.some(({ role }) => ['DELIVERY_PARTNER', 'DELIVERY_STAFF'].includes(role.name)) && !capabilities.includes('DELIVERY'))) throw new HttpError(400, 'Active delivery partner is required');
        const delivery = await database.delivery.create({ data: { orderId, shopId: order.shopId, vendorId: order.vendorId, deliveryAddress: order.deliveryAddressSnapshot ?? 'Customer address', scheduledAt: input.deliveryDate ?? order.requestedDeliveryDate, assignments: { create: { userId: input.userId } } } });
        await database.order.update({ where: { id: orderId }, data: { assignedAt: new Date(), status: 'ASSIGNED', statusHistory: { create: [{ previousStatus: order.status, newStatus: 'ASSIGNED', changedBy: context.userId, reason: 'ASSIGN_DELIVERY' }] } } });
        sendJson(response, 201, delivery);
        return true;
      }

      if (method === 'POST' && parts[5] === 'collect-payment' && parts.length === 6) {
        if (!isDeliveryRole(context.roles) && !context.roles.includes('SUPER_ADMIN')) throw new HttpError(403, 'Payment collection capability is required');
        const input = await body(request, paymentCollectionSchema);
        const paymentSummary = buildPaymentSummary(order.totalAmount, order.payments, order.orderDate);
        if (input.amount > paymentSummary.outstanding) throw new HttpError(400, 'Collected amount cannot exceed the outstanding balance');
        if (paymentSummary.outstanding <= 0) throw new HttpError(400, 'Order is already fully paid');
        if (input.method === 'UPI' && !input.referenceNumber) throw new HttpError(400, 'UPI reference number is required');
        const payment = await database.payment.create({ data: { shopId: order.shopId, orderId, vendorId: order.vendorId, amount: input.amount, method: input.method, status: input.method === 'CASH' ? 'CASH_COLLECTED' : 'UPI_COLLECTED', referenceNumber: input.referenceNumber, paidAt: new Date(), receivedAt: new Date(), receivedByUserId: context.userId, deliveryPartnerId: context.userId, notes: input.notes } });
        sendJson(response, 201, { payment, summary: buildPaymentSummary(order.totalAmount, [...order.payments, payment], order.orderDate) });
        return true;
      }

      if (method === 'GET' && parts.length === 5) {
        sendJson(response, 200, order);
        return true;
      }
    }
    throw new HttpError(404, 'Marketplace route not found');
  }

  if (parts[2] === 'catalog') {
    const resource = parts[3];
    const resourceName = resource ?? '';
    const schemas: Record<string, { parse(value: unknown): unknown }> = { categories: categorySchema, units: unitSchema, products: productSchema, variants: variantSchema, prices: priceSchema };
    const schema = schemas[resourceName];
    if (!schema) throw new HttpError(404, 'Catalog route not found');
    const permissionResource = resource === 'prices' ? 'catalog.prices' : `catalog.${resource}`;
    if (method === 'GET' && parts.length === 4) {
      await authAndPermission(request, database, `${permissionResource}.read`);
      if (resourceName === 'products') {
        const products = await database.product.findMany({
          where: { status: 'ACTIVE' },
          include: { vendor: true, category: true, unit: true, prices: { where: { shopId: null }, orderBy: { validFrom: 'desc' }, take: 1 } },
          orderBy: { name: 'asc' },
        });
        const productsWithVendor = products.map((product) => ({
          ...product,
          price: product.prices[0]?.price ?? null,
          vendorName: product.vendor?.name ?? null,
        }));
        sendJson(response, 200, productsWithVendor);
        return true;
      }
      const delegate = { categories: database.category, units: database.unit, products: database.product, variants: database.productVariant, prices: database.productPrice }[resourceName as keyof typeof schemas];
      sendJson(response, 200, await (delegate as { findMany(args?: unknown): Promise<unknown[]> }).findMany({ orderBy: { name: 'asc' } }));
      return true;
    }
    if (method === 'POST' && parts.length === 4) {
      const context = await authAndPermission(request, database, `${permissionResource}.create`);
      const input = await body(request, schema);
      const delegate = { categories: database.category, units: database.unit, products: database.product, variants: database.productVariant, prices: database.productPrice }[resourceName as keyof typeof schemas];
      const record = await (delegate as { create(args: unknown): Promise<{ id: string }> }).create({ data: input });
      await audit(database, context.userId, 'CREATE', resourceName, record.id);
      sendJson(response, 201, record);
      return true;
    }
    if (method === 'PATCH' && parts.length === 5) {
      const context = await authAndPermission(request, database, `${permissionResource}.update`);
      const recordId = idFrom(parts, 4);
      const input = await body(request, schema);
      const delegate = { categories: database.category, units: database.unit, products: database.product, variants: database.productVariant, prices: database.productPrice }[resourceName as keyof typeof schemas];
      const record = await (delegate as { update(args: unknown): Promise<{ id: string }> }).update({ where: { id: recordId }, data: input });
      await audit(database, context.userId, 'UPDATE', resourceName, recordId);
      sendJson(response, 200, record);
      return true;
    }
  }

  if (parts[2] === 'warehouses') {
    if (method === 'GET' && parts.length === 3) {
      const context = await authenticate(request, database);
      requirePermission(context, 'warehouse.read');
      const query = new URL(request.url ?? '/', 'http://localhost');
      const where: Record<string, unknown> = {};
      if (query.searchParams.get('branchId')) where.branchId = query.searchParams.get('branchId');
      if (query.searchParams.get('isActive') !== null) where.isActive = query.searchParams.get('isActive') === 'true';
      const warehouses = await database.warehouse.findMany({ where, include: { branch: true }, orderBy: { name: 'asc' } });
      sendJson(response, 200, warehouses);
      return true;
    }

    if (method === 'POST' && parts.length === 3) {
      const context = await authenticate(request, database);
      requirePermission(context, 'warehouse.manage');
      const input = await body(request, warehouseSchema);
      const warehouse = await database.warehouse.create({ data: input, include: { branch: true } });
      await audit(database, context.userId, 'CREATE', 'Warehouse', warehouse.id, { code: warehouse.code });
      sendJson(response, 201, warehouse);
      return true;
    }

    if (parts.length >= 4) {
      const warehouseId = idFrom(parts, 3);
      const context = await authenticate(request, database);

      if (method === 'GET' && parts.length === 4) {
        requirePermission(context, 'warehouse.read');
        const warehouse = await database.warehouse.findUnique({ where: { id: warehouseId }, include: { branch: true } });
        if (!warehouse) throw new HttpError(404, 'Warehouse not found');
        sendJson(response, 200, warehouse);
        return true;
      }

      if (method === 'PATCH' && parts.length === 4) {
        requirePermission(context, 'warehouse.manage');
        const input = await body(request, warehouseSchema.partial());
        const warehouse = await database.warehouse.update({ where: { id: warehouseId }, data: input, include: { branch: true } });
        await audit(database, context.userId, 'UPDATE', 'Warehouse', warehouseId, { code: warehouse.code });
        sendJson(response, 200, warehouse);
        return true;
      }

      if (method === 'GET' && parts[4] === 'inventory') {
        requirePermission(context, 'inventory.read');
        const inventory = await database.inventory.findMany({
          where: { warehouseId },
          include: {
            warehouse: true,
            variant: { include: { product: { include: { category: true, unit: true } }, unit: true } },
          },
          orderBy: { variantId: 'asc' },
        });
        sendJson(response, 200, inventory.map((item) => ({
          ...item,
          onHandQuantity: item.quantity,
          reservedQuantity: item.reservedQuantity,
          availableQuantity: calculateAvailableQuantity(item.quantity, item.reservedQuantity),
        })));
        return true;
      }
    }

    throw new HttpError(404, 'Warehouse route not found');
  }

  if (parts[2] === 'inventory') {
    if (method === 'GET' && parts.length === 3) {
      const context = await authenticate(request, database);
      requirePermission(context, 'inventory.read');
      const query = new URL(request.url ?? '/', 'http://localhost');
      const where: Record<string, unknown> = {};
      if (query.searchParams.get('warehouseId')) where.warehouseId = query.searchParams.get('warehouseId');
      if (query.searchParams.get('variantId')) where.variantId = query.searchParams.get('variantId');
      if (query.searchParams.get('productId')) {
        where.variant = { is: { productId: query.searchParams.get('productId')! } };
      }
      if (query.searchParams.get('categoryId')) {
        where.variant = { is: { product: { is: { categoryId: query.searchParams.get('categoryId')! } } } };
      }
      const inventory = await database.inventory.findMany({
        where,
        include: {
          warehouse: true,
          variant: { include: { product: { include: { category: true, unit: true } }, unit: true } },
        },
        orderBy: { warehouseId: 'asc' },
      });
      const lowStockOnly = query.searchParams.has('lowStock');
      const filtered = inventory.filter((item) => {
        const available = calculateAvailableQuantity(item.quantity, item.reservedQuantity);
        if (!lowStockOnly) return true;
        return available.lte(new Prisma.Decimal(query.searchParams.get('lowStock') ?? '0'));
      });
      const page = Math.max(1, Number(query.searchParams.get('page') ?? '1'));
      const limit = Math.min(100, Math.max(1, Number(query.searchParams.get('limit') ?? '20')));
      const paged = filtered.slice((page - 1) * limit, page * limit);
      sendJson(response, 200, {
        items: paged.map((item) => ({
          ...item,
          onHandQuantity: item.quantity,
          reservedQuantity: item.reservedQuantity,
          availableQuantity: calculateAvailableQuantity(item.quantity, item.reservedQuantity),
        })),
        pagination: {
          page,
          limit,
          total: filtered.length,
          totalPages: Math.ceil(filtered.length / limit),
        },
      });
      return true;
    }

    if (method === 'GET' && parts[3] === 'variant' && parts.length === 5) {
      const context = await authenticate(request, database);
      requirePermission(context, 'inventory.read');
      const variantId = idFrom(parts, 4);
      const inventory = await database.inventory.findMany({
        where: { variantId },
        include: { warehouse: true, variant: { include: { product: { include: { category: true, unit: true } }, unit: true } } },
        orderBy: { quantity: 'desc' },
      });
      sendJson(response, 200, inventory.map((item) => ({
        ...item,
        onHandQuantity: item.quantity,
        reservedQuantity: item.reservedQuantity,
        availableQuantity: calculateAvailableQuantity(item.quantity, item.reservedQuantity),
      })));
      return true;
    }

    if (method === 'GET' && parts.length === 4 && parts[3] !== 'variant' && parts[3] !== 'transactions' && parts[3] !== 'receipts' && parts[3] !== 'issue' && parts[3] !== 'adjustments' && parts[3] !== 'transfer') {
      const context = await authenticate(request, database);
      requirePermission(context, 'inventory.read');
      const inventoryId = idFrom(parts, 3);
      const inventory = await database.inventory.findUnique({
        where: { id: inventoryId },
        include: { warehouse: true, variant: { include: { product: { include: { category: true, unit: true } }, unit: true } } },
      });
      if (!inventory) throw new HttpError(404, 'Inventory record not found');
      sendJson(response, 200, {
        ...inventory,
        onHandQuantity: inventory.quantity,
        reservedQuantity: inventory.reservedQuantity,
        availableQuantity: calculateAvailableQuantity(inventory.quantity, inventory.reservedQuantity),
      });
      return true;
    }

    if (method === 'GET' && parts[3] === 'low-stock') {
      const context = await authenticate(request, database);
      requirePermission(context, 'inventory.read');
      const inventory = await database.inventory.findMany({
        include: { warehouse: true, variant: { include: { product: { include: { category: true, unit: true } }, unit: true } } },
      });
      const normalized = inventory.filter((item) => calculateAvailableQuantity(item.quantity, item.reservedQuantity).lte(new Prisma.Decimal(item.variant.product.minOrderQuantity ?? 0)) || item.quantity.lte(new Prisma.Decimal(item.variant.product.minOrderQuantity ?? 0)));
      sendJson(response, 200, normalized.map((item) => ({
        warehouse: item.warehouse,
        product: item.variant.product,
        variant: item.variant,
        currentStock: item.quantity,
        reserved: item.reservedQuantity,
        available: calculateAvailableQuantity(item.quantity, item.reservedQuantity),
        reorderLevel: item.variant.product.minOrderQuantity ?? new Prisma.Decimal(0),
      })));
      return true;
    }

    if (method === 'GET' && parts[3] === 'transactions') {
      const context = await authenticate(request, database);
      requirePermission(context, 'inventory.read');
      const query = new URL(request.url ?? '/', 'http://localhost');
      const where: Record<string, unknown> = {};
      if (query.searchParams.get('warehouseId')) where.warehouseId = query.searchParams.get('warehouseId');
      if (query.searchParams.get('variantId')) where.variantId = query.searchParams.get('variantId');
      if (query.searchParams.get('referenceType')) where.referenceType = query.searchParams.get('referenceType');
      if (query.searchParams.get('referenceId')) where.referenceId = query.searchParams.get('referenceId');
      if (query.searchParams.get('type')) where.type = query.searchParams.get('type');
      if (query.searchParams.get('dateFrom')) where.createdAt = { gte: new Date(query.searchParams.get('dateFrom')!) };
      if (query.searchParams.get('dateTo')) {
        const dateTo = new Date(query.searchParams.get('dateTo')!);
        dateTo.setHours(23, 59, 59, 999);
        where.createdAt = { ...((where.createdAt as Record<string, Date>) ?? {}), lte: dateTo };
      }
      const transactions = await database.inventoryTransaction.findMany({
        where,
        include: { warehouse: true },
        orderBy: { createdAt: 'desc' },
      });
      sendJson(response, 200, transactions);
      return true;
    }

    if (method === 'POST' && parts[3] === 'receipts') {
      const context = await authenticate(request, database);
      requirePermission(context, 'inventory.receive');
      const input = await body(request, inventoryReceiptSchema);
      const idem = await assertInventoryIdempotency(database, request, context, input);
      if (idem) {
        sendJson(response, 200, { idempotent: true, message: 'Receipt already processed' });
        return true;
      }
      const quantity = parseDecimalQuantity(input.quantity, 'quantity');
      const record = await database.$transaction(async (tx) => {
        const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });
        if (!warehouse) throw new HttpError(404, 'Warehouse not found');
        const variant = await tx.productVariant.findUnique({ where: { id: input.variantId }, include: { product: true, unit: true } });
        if (!variant) throw new HttpError(404, 'Variant not found');
        const inventory = await tx.inventory.upsert({
          where: { warehouseId_variantId: { warehouseId: input.warehouseId, variantId: input.variantId } },
          update: { quantity: { increment: quantity } },
          create: { warehouseId: input.warehouseId, variantId: input.variantId, quantity, reservedQuantity: new Prisma.Decimal(0) },
          include: { warehouse: true, variant: { include: { product: { include: { category: true, unit: true } }, unit: true } } },
        });
        const transaction = await tx.inventoryTransaction.create({
          data: {
            warehouseId: input.warehouseId,
            variantId: input.variantId,
            type: 'PURCHASE',
            quantity,
            referenceType: input.referenceType ?? 'PURCHASE',
            referenceId: input.referenceId ?? null,
            notes: input.notes ?? 'Stock receipt',
          },
        });
        await audit(tx as unknown as PrismaClient, context.userId, 'CREATE', 'InventoryTransaction', transaction.id, { warehouseId: input.warehouseId, variantId: input.variantId, type: 'PURCHASE', quantity: quantity.toString() });
        return { inventory, transaction };
      });
      sendJson(response, 201, record);
      return true;
    }

    if (method === 'POST' && parts[3] === 'issue') {
      const context = await authenticate(request, database);
      requirePermission(context, 'inventory.issue');
      const input = await body(request, inventoryIssueSchema);
      const idem = await assertInventoryIdempotency(database, request, context, input);
      if (idem) {
        sendJson(response, 200, { idempotent: true, message: 'Issue already processed' });
        return true;
      }
      const quantity = parseDecimalQuantity(input.quantity, 'quantity');
      const result = await database.$transaction(async (tx) => {
        const inventory = await tx.inventory.findUnique({ where: { warehouseId_variantId: { warehouseId: input.warehouseId, variantId: input.variantId } } });
        if (!inventory) throw new HttpError(404, 'Inventory record not found');
        const available = calculateAvailableQuantity(inventory.quantity, inventory.reservedQuantity);
        if (available.lt(quantity)) throw new HttpError(400, `Insufficient stock for variant ${input.variantId}. Requested: ${quantity.toString()}, available: ${available.toString()}`);
        const updated = await tx.inventory.update({
          where: { id: inventory.id },
          data: { quantity: { decrement: quantity } },
        });
        const transaction = await tx.inventoryTransaction.create({ data: { warehouseId: input.warehouseId, variantId: input.variantId, type: 'SALE', quantity, referenceType: input.referenceType ?? 'ISSUE', referenceId: input.referenceId ?? null, notes: input.notes ?? 'Stock issue' } });
        await audit(tx as unknown as PrismaClient, context.userId, 'UPDATE', 'Inventory', inventory.id, { warehouseId: input.warehouseId, variantId: input.variantId, type: 'SALE', beforeQuantity: inventory.quantity.toString(), afterQuantity: updated.quantity.toString(), quantity: quantity.toString() });
        return { inventory: updated, transaction };
      });
      sendJson(response, 201, result);
      return true;
    }

    if (method === 'POST' && parts[3] === 'adjustments') {
      const context = await authenticate(request, database);
      requirePermission(context, 'inventory.adjust');
      const input = await body(request, inventoryAdjustmentSchema);
      const idem = await assertInventoryIdempotency(database, request, context, input);
      if (idem) {
        sendJson(response, 200, { idempotent: true, message: 'Adjustment already processed' });
        return true;
      }
      const quantity = parseDecimalQuantity(input.quantity, 'quantity');
      const result = await database.$transaction(async (tx) => {
        const inventory = await tx.inventory.findUnique({ where: { warehouseId_variantId: { warehouseId: input.warehouseId, variantId: input.variantId } } });
        if (!inventory) throw new HttpError(404, 'Inventory record not found');
        const beforeQuantity = inventory.quantity;
        const afterQuantity = input.direction === 'INCREASE' ? beforeQuantity.plus(quantity) : beforeQuantity.minus(quantity);
        if (afterQuantity.lt(0)) throw new HttpError(400, 'Adjustment would reduce stock below zero');
        const updated = await tx.inventory.update({ where: { id: inventory.id }, data: { quantity: afterQuantity } });
        const transaction = await tx.inventoryTransaction.create({ data: { warehouseId: input.warehouseId, variantId: input.variantId, type: 'ADJUSTMENT', quantity, referenceType: input.referenceType ?? 'ADJUSTMENT', referenceId: input.referenceId ?? null, notes: `${input.reason}${input.notes ? `: ${input.notes}` : ''}` } });
        await audit(tx as unknown as PrismaClient, context.userId, 'UPDATE', 'Inventory', inventory.id, { warehouseId: input.warehouseId, variantId: input.variantId, beforeQuantity: beforeQuantity.toString(), afterQuantity: afterQuantity.toString(), reason: input.reason, direction: input.direction });
        return { inventory: updated, transaction };
      });
      sendJson(response, 201, result);
      return true;
    }

    if (method === 'POST' && parts[3] === 'transfer') {
      const context = await authenticate(request, database);
      requirePermission(context, 'inventory.transfer');
      const input = await body(request, inventoryTransferSchema);
      const idem = await assertInventoryIdempotency(database, request, context, input);
      if (idem) {
        sendJson(response, 200, { idempotent: true, message: 'Transfer already processed' });
        return true;
      }
      const quantity = parseDecimalQuantity(input.quantity, 'quantity');
      const result = await database.$transaction(async (tx) => {
        if (input.fromWarehouseId === input.toWarehouseId) throw new HttpError(400, 'Transfer source and destination must differ');
        const source = await tx.inventory.findUnique({ where: { warehouseId_variantId: { warehouseId: input.fromWarehouseId, variantId: input.variantId } } });
        if (!source) throw new HttpError(404, 'Source inventory not found');
        const available = calculateAvailableQuantity(source.quantity, source.reservedQuantity);
        if (available.lt(quantity)) throw new HttpError(400, `Insufficient stock to transfer from warehouse ${input.fromWarehouseId}`);
        const destination = await tx.inventory.upsert({
          where: { warehouseId_variantId: { warehouseId: input.toWarehouseId, variantId: input.variantId } },
          update: { quantity: { increment: quantity } },
          create: { warehouseId: input.toWarehouseId, variantId: input.variantId, quantity, reservedQuantity: new Prisma.Decimal(0) },
        });
        const sourceUpdated = await tx.inventory.update({ where: { id: source.id }, data: { quantity: { decrement: quantity } } });
        const sourceTx = await tx.inventoryTransaction.create({ data: { warehouseId: input.fromWarehouseId, variantId: input.variantId, type: 'RETURN_TRANSFER', quantity, referenceType: 'TRANSFER', referenceId: `transfer:${input.toWarehouseId}`, notes: input.notes ?? input.reason ?? 'Warehouse transfer' } });
        const destTx = await tx.inventoryTransaction.create({ data: { warehouseId: input.toWarehouseId, variantId: input.variantId, type: 'RETURN_TRANSFER', quantity, referenceType: 'TRANSFER', referenceId: `transfer:${input.fromWarehouseId}`, notes: input.notes ?? input.reason ?? 'Warehouse transfer' } });
        await audit(tx as unknown as PrismaClient, context.userId, 'TRANSFER', 'Inventory', source.id, { fromWarehouseId: input.fromWarehouseId, toWarehouseId: input.toWarehouseId, variantId: input.variantId, quantity: quantity.toString(), reason: input.reason ?? 'Warehouse transfer' });
        return { source: sourceUpdated, destination, transactions: [sourceTx, destTx] };
      });
      sendJson(response, 201, result);
      return true;
    }

    if (method === 'POST' && parts[3] === 'reservations') {
      const context = await authenticate(request, database);
      requirePermission(context, 'inventory.reserve');
      const input = await body(request, { parse: (value: unknown) => ({ warehouseId: (value as { warehouseId: string }).warehouseId, variantId: (value as { variantId: string }).variantId, orderId: (value as { orderId: string }).orderId, quantity: parseDecimalQuantity((value as { quantity: number }).quantity, 'quantity') }) });
      const idem = await assertInventoryIdempotency(database, request, context, input);
      if (idem) {
        sendJson(response, 200, { idempotent: true, message: 'Reservation already processed' });
        return true;
      }
      const quantity = input.quantity;
      const result = await database.$transaction(async (tx) => {
        const inventory = await tx.inventory.findUnique({ where: { warehouseId_variantId: { warehouseId: input.warehouseId, variantId: input.variantId } } });
        if (!inventory) throw new HttpError(404, 'Inventory record not found');
        const available = calculateAvailableQuantity(inventory.quantity, inventory.reservedQuantity);
        if (available.lt(quantity)) throw new HttpError(400, `Insufficient stock to reserve ${quantity.toString()} at warehouse ${input.warehouseId}`);
        const order = await tx.order.findUnique({ where: { id: input.orderId } });
        if (!order) throw new HttpError(404, 'Order not found');
        const reservation = await tx.stockReservation.create({ data: { warehouseId: input.warehouseId, variantId: input.variantId, orderId: input.orderId, quantity, status: 'ACTIVE' } });
        const updated = await tx.inventory.update({ where: { id: inventory.id }, data: { reservedQuantity: { increment: quantity } } });
        const txRecord = await tx.inventoryTransaction.create({ data: { warehouseId: input.warehouseId, variantId: input.variantId, type: 'RESERVATION', quantity, referenceType: 'ORDER', referenceId: input.orderId, notes: 'Order reservation' } });
        await audit(tx as unknown as PrismaClient, context.userId, 'CREATE', 'StockReservation', reservation.id, { orderId: input.orderId, warehouseId: input.warehouseId, variantId: input.variantId, quantity: quantity.toString() });
        return { reservation, inventory: updated, transaction: txRecord };
      });
      sendJson(response, 201, result);
      return true;
    }

    if (method === 'POST' && parts[3] === 'reservations' && parts.length >= 6) {
      const reservationId = idFrom(parts, 4);
      if (parts[5] === 'release') {
        const context = await authenticate(request, database);
        requirePermission(context, 'inventory.release');
        const idem = await assertInventoryIdempotency(database, request, context, { reservationId, action: 'release' });
        if (idem) {
          sendJson(response, 200, { idempotent: true, message: 'Release already processed' });
          return true;
        }
        const reservation = await database.stockReservation.findUnique({ where: { id: reservationId } });
        if (!reservation) throw new HttpError(404, 'Reservation not found');
        if (!isReservationActionAllowed(reservation.status, 'release')) throw new HttpError(409, 'Reservation cannot be released in its current state');
        const result = await database.$transaction(async (tx) => {
          const inventory = await tx.inventory.findUnique({ where: { warehouseId_variantId: { warehouseId: reservation.warehouseId, variantId: reservation.variantId } } });
          if (!inventory) throw new HttpError(404, 'Inventory record not found');
          const updated = await tx.inventory.update({ where: { id: inventory.id }, data: { reservedQuantity: { decrement: reservation.quantity } } });
          const released = await tx.stockReservation.update({ where: { id: reservation.id }, data: { status: 'RELEASED', releasedAt: new Date() } });
          const txRecord = await tx.inventoryTransaction.create({ data: { warehouseId: reservation.warehouseId, variantId: reservation.variantId, type: 'RELEASE', quantity: reservation.quantity, referenceType: 'RESERVATION', referenceId: reservation.id, notes: 'Reservation released' } });
          await audit(tx as unknown as PrismaClient, context.userId, 'UPDATE', 'StockReservation', reservation.id, { action: 'release', warehouseId: reservation.warehouseId, variantId: reservation.variantId, quantity: reservation.quantity.toString() });
          return { reservation: released, inventory: updated, transaction: txRecord };
        });
        sendJson(response, 200, result);
        return true;
      }

      if (parts[5] === 'consume') {
        const context = await authenticate(request, database);
        requirePermission(context, 'inventory.issue');
        const idem = await assertInventoryIdempotency(database, request, context, { reservationId, action: 'consume' });
        if (idem) {
          sendJson(response, 200, { idempotent: true, message: 'Consumption already processed' });
          return true;
        }
        const reservation = await database.stockReservation.findUnique({ where: { id: reservationId } });
        if (!reservation) throw new HttpError(404, 'Reservation not found');
        if (!isReservationActionAllowed(reservation.status, 'consume')) throw new HttpError(409, 'Reservation cannot be consumed in its current state');
        const result = await database.$transaction(async (tx) => {
          const inventory = await tx.inventory.findUnique({ where: { warehouseId_variantId: { warehouseId: reservation.warehouseId, variantId: reservation.variantId } } });
          if (!inventory) throw new HttpError(404, 'Inventory record not found');
          const updated = await tx.inventory.update({ where: { id: inventory.id }, data: { quantity: { decrement: reservation.quantity }, reservedQuantity: { decrement: reservation.quantity } } });
          const consumed = await tx.stockReservation.update({ where: { id: reservation.id }, data: { status: 'CONSUMED', releasedAt: new Date() } });
          const txRecord = await tx.inventoryTransaction.create({ data: { warehouseId: reservation.warehouseId, variantId: reservation.variantId, type: 'SALE', quantity: reservation.quantity, referenceType: 'RESERVATION', referenceId: reservation.id, notes: 'Reservation consumed' } });
          await audit(tx as unknown as PrismaClient, context.userId, 'UPDATE', 'StockReservation', reservation.id, { action: 'consume', warehouseId: reservation.warehouseId, variantId: reservation.variantId, quantity: reservation.quantity.toString() });
          return { reservation: consumed, inventory: updated, transaction: txRecord };
        });
        sendJson(response, 200, result);
        return true;
      }
    }

    throw new HttpError(404, 'Inventory route not found');
  }

  if (parts[2] === 'orders') {
    if (method === 'GET' && parts.length === 3) {
      const context = await authenticate(request, database);
      const query = new URL(request.url ?? '/', 'http://localhost');
      const shopId = query.searchParams.get('shopId') ?? undefined;
      if (!isAdminLike(context.roles)) {
        if (!shopId) throw new HttpError(403, 'Shop id is required for shop-level order access');
        await ensureShopAccess(context, database, shopId);
      }
      const where: Record<string, unknown> = shopId ? { shopId } : {};
      if (query.searchParams.get('orderNumber')) where.orderNumber = { contains: query.searchParams.get('orderNumber')! };
      if (query.searchParams.get('status')) where.status = query.searchParams.get('status') as never;
      if (query.searchParams.get('shopId')) where.shopId = query.searchParams.get('shopId')!;
      if (query.searchParams.get('deliveryDate')) {
        const date = new Date(`${query.searchParams.get('deliveryDate')}T00:00:00.000Z`);
        where.requestedDeliveryDate = { gte: date, lt: new Date(date.getTime() + 86400000) };
      }
      if (query.searchParams.get('orderDate')) {
        const date = new Date(`${query.searchParams.get('orderDate')}T00:00:00.000Z`);
        where.orderDate = { gte: date, lt: new Date(date.getTime() + 86400000) };
      }
      const page = Math.max(1, Number(query.searchParams.get('page') ?? '1'));
      const pageSize = Math.min(100, Math.max(1, Number(query.searchParams.get('pageSize') ?? '20')));
      const requestedSortField = query.searchParams.get('sortField') ?? 'createdAt';
      const sortField = ['createdAt', 'orderDate', 'requestedDeliveryDate', 'status', 'orderNumber'].includes(requestedSortField) ? requestedSortField : 'createdAt';
      const sortDirection = (query.searchParams.get('sortDirection') ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
      const orders = await database.order.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { [sortField]: sortDirection } as never,
        include: { shop: { select: { id: true, name: true, ownerName: true, primaryMobile: true, whatsappNumber: true } }, items: true, statusHistory: { orderBy: { createdAt: 'desc' } } },
      });
      const total = await database.order.count({ where });
      sendJson(response, 200, { items: orders, pagination: { page, pageSize, total, totalPages: Math.ceil(total / Math.max(pageSize, 1)) } });
      return true;
    }

    if (method === 'GET' && parts[3] === 'packing-list') {
      const context = await authenticate(request, database);
      requirePermission(context, 'orders.read');
      const query = new URL(request.url ?? '/', 'http://localhost');
      const dateValue = query.searchParams.get('date');
      if (!dateValue || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) throw new HttpError(400, 'date must be YYYY-MM-DD');
      const start = new Date(`${dateValue}T00:00:00.000Z`);
      const end = new Date(start.getTime() + 86400000);
      const shopId = query.searchParams.get('shopId');
      if (!isAdminLike(context.roles) && !shopId) throw new HttpError(403, 'Shop id is required for shop-level order access');
      if (shopId) await ensureShopAccess(context, database, shopId);
      const orders = await database.order.findMany({
        where: { requestedDeliveryDate: { gte: start, lt: end }, ...(shopId ? { shopId } : {}) },
        select: {
          orderNumber: true,
          status: true,
          requestedDeliveryDate: true,
          shop: { select: { name: true, primaryMobile: true, whatsappNumber: true } },
          items: { select: { productNameSnapshot: true, variantNameSnapshot: true, skuSnapshot: true, unitSnapshot: true, orderedQuantity: true, packedQuantity: true } },
        },
        orderBy: { orderNumber: 'asc' },
      });
      sendJson(response, 200, orders.flatMap((order) => order.items.map((item) => ({
        orderNumber: order.orderNumber,
        shopName: order.shop.name,
        shopPhone: order.shop.primaryMobile,
        whatsappNumber: order.shop.whatsappNumber,
        product: item.productNameSnapshot,
        variant: item.variantNameSnapshot,
        sku: item.skuSnapshot,
        unit: item.unitSnapshot,
        orderedQuantity: item.orderedQuantity,
        packedQuantity: item.packedQuantity,
        remainingQuantity: new Prisma.Decimal(item.orderedQuantity.toString()).minus(new Prisma.Decimal(item.packedQuantity.toString())),
        deliveryDate: order.requestedDeliveryDate,
        status: order.status,
      }))));
      return true;
    }

    if (method === 'GET' && parts[3] === 'daily-demand') {
      const context = await authenticate(request, database);
      requirePermission(context, 'orders.read');
      const query = new URL(request.url ?? '/', 'http://localhost');
      const date = query.searchParams.get('date');
      const targetDate = date ? new Date(`${date}T00:00:00.000Z`) : new Date();
      const start = new Date(targetDate);
      const end = new Date(targetDate);
      end.setDate(end.getDate() + 1);
      const shopId = query.searchParams.get('shopId');
      if (!isAdminLike(context.roles) && !shopId) throw new HttpError(403, 'Shop id is required for shop-level order access');
      if (shopId) await ensureShopAccess(context, database, shopId);
      const orders = await database.order.findMany({
        where: { requestedDeliveryDate: { gte: start, lt: end }, ...(shopId ? { shopId } : {}) },
        select: { status: true, items: { select: { productId: true, variantId: true, productNameSnapshot: true, variantNameSnapshot: true, unitSnapshot: true, orderedQuantity: true, packedQuantity: true, deliveredQuantity: true } } },
      });
      const aggregates = new Map<string, { product: string | null; variant: string | null; unit: string | null; orderedQuantity: Prisma.Decimal; confirmedQuantity: Prisma.Decimal; packedQuantity: Prisma.Decimal; deliveredQuantity: Prisma.Decimal }>();
      for (const order of orders) {
        for (const item of order.items) {
          const key = `${item.productId}:${item.variantId ?? 'none'}`;
          const existing = aggregates.get(key) ?? { product: item.productNameSnapshot, variant: item.variantNameSnapshot, unit: item.unitSnapshot, orderedQuantity: new Prisma.Decimal(0), confirmedQuantity: new Prisma.Decimal(0), packedQuantity: new Prisma.Decimal(0), deliveredQuantity: new Prisma.Decimal(0) };
          existing.orderedQuantity = existing.orderedQuantity.plus(item.orderedQuantity);
          if (['CONFIRMED', 'PICKING', 'PACKED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'PARTIALLY_DELIVERED', 'DELIVERED'].includes(order.status)) existing.confirmedQuantity = existing.confirmedQuantity.plus(item.orderedQuantity);
          existing.packedQuantity = existing.packedQuantity.plus(item.packedQuantity);
          existing.deliveredQuantity = existing.deliveredQuantity.plus(item.deliveredQuantity);
          aggregates.set(key, existing);
        }
      }
      sendJson(response, 200, Array.from(aggregates.values()).map((item) => ({ ...item, remainingQuantity: item.orderedQuantity.minus(item.deliveredQuantity) })));
      return true;
    }

    if (method === 'POST' && parts.length === 3) {
      const context = await authenticate(request, database);
      requirePermission(context, 'orders.create');
      const input = await body(request, orderSchema);
      const idemHeader = request.headers['idempotency-key'] ?? request.headers['Idempotency-Key'];
      const idempotencyKey = typeof idemHeader === 'string' ? idemHeader.trim() : Array.isArray(idemHeader) ? idemHeader[0]?.trim() : undefined;
      const requestHash = hashRequestPayload(input);
      if (idempotencyKey) {
        const existingKey = await database.idempotencyKey.findUnique({ where: { key: idempotencyKey }, include: { order: { include: { items: true, statusHistory: true } } } });
        if (existingKey) {
          if (existingKey.userId !== context.userId || existingKey.requestHash !== requestHash) throw new HttpError(409, 'Idempotency key was already used with a different request');
          if (!existingKey.order) throw new HttpError(409, 'A request with this idempotency key is already in progress');
          sendJson(response, 200, { idempotent: true, order: existingKey.order });
          return true;
        }
      }
      const shopId = input.shopId ?? undefined;
      if (!shopId) throw new HttpError(400, 'Shop id is required');
      if (!isAdminLike(context.roles) && shopId !== (await database.shop.findFirst({ where: { id: shopId }, select: { id: true } }))?.id) {
        throw new HttpError(403, 'Order is not accessible to this user');
      }
      const shop = await database.shop.findUnique({ where: { id: shopId }, include: { addresses: true } });
      if (!shop) throw new HttpError(404, 'Shop not found');
      if (!shop.isActive) throw new HttpError(400, 'Shop is inactive');
      if (input.deliveryAddressId) {
        const address = await database.shopAddress.findFirst({ where: { id: input.deliveryAddressId, shopId } });
        if (!address) throw new HttpError(404, 'Delivery address not found');
      }
      const cutoffSetting = await database.setting.findFirst({ where: { key: 'order.cutoff.time' } });
      const cutoffTime = (cutoffSetting?.value as string | undefined) ?? DEFAULT_ORDER_CUTOFF;
      const timezoneSetting = await database.setting.findFirst({ where: { key: 'order.timezone' } });
      const timezone = (timezoneSetting?.value as string | undefined) ?? DEFAULT_ORDER_TIMEZONE;
      const effectiveDeliveryDate = calculateDeliveryDate(new Date(), cutoffTime, timezone);
      const orderDate = new Date();
      const itemRows: Array<{ productId: string; variantId?: string; unitId: string; productNameSnapshot: string; variantNameSnapshot: string | null; skuSnapshot: string | null; unitSnapshot: string | null; orderedQuantity: number; unitPrice: number; taxRate: number; taxAmount: number; lineTotal: number; notes?: string; }> = [];
      let subtotal = 0;
      for (const item of input.items) {
        const product = await database.product.findUnique({ where: { id: item.productId }, include: { unit: true, variants: true } });
        if (!product) throw new HttpError(404, `Product not found: ${item.productId}`);
        if (product.status !== 'ACTIVE') throw new HttpError(400, `Product is inactive: ${product.name}`);
        const variant = item.variantId ? await database.productVariant.findUnique({ where: { id: item.variantId }, include: { unit: true } }) : null;
        if (item.variantId && !variant) throw new HttpError(404, 'Variant not found');
        if (variant && variant.status !== 'ACTIVE') throw new HttpError(400, 'Variant is inactive');
        const priceRecord = await database.productPrice.findFirst({
          where: {
            OR: [
              { variantId: item.variantId ?? undefined, shopId },
              { productId: item.productId, shopId },
              { variantId: item.variantId ?? undefined, shopId: null },
              { productId: item.productId, shopId: null },
            ],
          },
          orderBy: { validFrom: 'desc' },
        });
        if (!priceRecord) throw new HttpError(400, 'Pricing is not available for the selected product');
        const priceValue = Number(priceRecord.price);
        const quantity = Number(item.quantity);
        const lineTotal = priceValue * quantity;
        const taxRate = 0;
        const taxAmount = 0;
        subtotal += lineTotal;
        itemRows.push({
          productId: item.productId,
          variantId: item.variantId,
          unitId: item.unitId ?? (variant?.unitId ?? product.unitId),
          productNameSnapshot: product.name,
          variantNameSnapshot: variant?.name ?? product.name,
          skuSnapshot: variant?.sku ?? product.sku,
          unitSnapshot: variant?.unit?.code ?? product.unit.code,
          orderedQuantity: quantity,
          unitPrice: priceValue,
          taxRate,
          taxAmount,
          lineTotal,
          notes: item.notes,
        });
      }
      if (idempotencyKey) {
        try {
          await database.idempotencyKey.create({ data: { key: idempotencyKey, userId: context.userId, requestHash } });
        } catch (error) {
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
          const concurrentKey = await database.idempotencyKey.findUnique({ where: { key: idempotencyKey }, include: { order: { include: { items: true, statusHistory: true } } } });
          if (!concurrentKey || concurrentKey.userId !== context.userId || concurrentKey.requestHash !== requestHash || !concurrentKey.order) throw new HttpError(409, 'A request with this idempotency key is already in progress or conflicts');
          sendJson(response, 200, { idempotent: true, order: concurrentKey.order });
          return true;
        }
      }
      const orderNumber = `FM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString().slice(2, 8)}`;
      const defaultWarehouse = await database.warehouse.findFirst({
        where: { isActive: true },
        orderBy: { code: 'asc' },
        select: { branchId: true },
      });
      if (!defaultWarehouse) throw new HttpError(400, 'No active warehouse is configured');
      const branchId = defaultWarehouse.branchId;
      let order;
      try {
        order = await database.$transaction(async (tx) => {
        const createdOrder = await tx.order.create({
          data: {
            orderNumber,
            shopId,
            branchId,
            status: 'DRAFT',
            orderDate,
            requestedDeliveryDate: effectiveDeliveryDate,
            deliveryAddressId: input.deliveryAddressId ?? null,
            subtotal: subtotal,
            taxAmount: 0,
            totalAmount: subtotal,
            notes: input.notes ?? null,
            customerNotes: input.customerNotes ?? null,
            internalNotes: input.internalNotes ?? null,
            items: { create: itemRows },
            statusHistory: { create: [{ newStatus: 'DRAFT', changedBy: context.userId, reason: 'CREATED', notes: 'Order created as draft' }] },
          },
          include: { items: true, statusHistory: true },
        });
        if (idempotencyKey) await tx.idempotencyKey.update({ where: { key: idempotencyKey }, data: { orderId: createdOrder.id } });
        return createdOrder;
        });
      } catch (error) {
        if (idempotencyKey) await database.idempotencyKey.deleteMany({ where: { key: idempotencyKey, orderId: null } });
        throw error;
      }
      if (!order) throw new HttpError(500, 'Failed to create order');
      await audit(database, context.userId, 'CREATE', 'Order', order.id, { orderNumber: order.orderNumber });
      sendJson(response, 201, order);
      return true;
    }

    if (parts.length >= 4) {
      const orderId = idFrom(parts, 3);
      const context = await authenticate(request, database);
      const order = await database.order.findUnique({
        where: { id: orderId },
        include: {
          items: true,
          shop: { select: { id: true, name: true, ownerName: true, primaryMobile: true, whatsappNumber: true } },
          deliveries: { include: { deliveredBy: { select: { id: true, name: true } }, assignments: { include: { user: { select: { id: true, name: true } } } }, items: true }, orderBy: { createdAt: 'asc' } },
          payments: { select: { id: true, amount: true, method: true, status: true, referenceNumber: true, paidAt: true, receivedAt: true, receivedBy: { select: { id: true, name: true } }, notes: true } },
        },
      });
      if (!order) throw new HttpError(404, 'Order not found');
      await ensureShopAccess(context, database, order.shopId);

      if (method === 'PATCH' && parts[4] === 'items' && parts.length === 7) {
        const itemId = idFrom(parts, 5);
        const action = parts[6];
        if (action !== 'packed-quantity' && action !== 'delivered-quantity' && action !== 'returned-quantity') throw new HttpError(404, 'Quantity route not found');
        const contextPermission = action === 'delivered-quantity' || action === 'returned-quantity' ? 'orders.update' : 'orders.update';
        requirePermission(context, contextPermission);
        const input = await body(request, quantitySchema);
        const updated = await database.$transaction(async (tx) => {
          const currentOrder = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
          const item = currentOrder?.items.find((candidate) => candidate.id === itemId);
          if (!currentOrder || !item) throw new HttpError(404, 'Order item not found');
          const quantity = new Prisma.Decimal(input.quantity);
          const ordered = new Prisma.Decimal(item.orderedQuantity);
          const packed = new Prisma.Decimal(item.packedQuantity);
          const delivered = new Prisma.Decimal(item.deliveredQuantity);
          const quantityError = quantityValidationError(action as QuantityChange, quantity, ordered, packed, delivered);
          if (quantityError) throw new HttpError(400, quantityError);
          if (action === 'delivered-quantity') {
            if (!['OUT_FOR_DELIVERY', 'PARTIALLY_DELIVERED'].includes(currentOrder.status)) throw new HttpError(400, 'Order is not in a deliverable status');
          }
          const data = action === 'packed-quantity' ? { packedQuantity: quantity } : action === 'delivered-quantity' ? { deliveredQuantity: quantity } : { returnedQuantity: quantity };
          const updatedItem = await tx.orderItem.update({ where: { id: itemId }, data });
          let status = currentOrder.status;
          if (action === 'packed-quantity') {
            const allPacked = currentOrder.items.every((candidate) => candidate.id === itemId ? quantity.gte(candidate.orderedQuantity) : new Prisma.Decimal(candidate.packedQuantity).gte(candidate.orderedQuantity));
            if (allPacked && currentOrder.status === 'PICKING') status = 'PACKED';
          }
          if (action === 'delivered-quantity') {
            status = deriveDeliveryStatus(currentOrder.status, currentOrder.items.map((candidate) => ({ orderedQuantity: new Prisma.Decimal(candidate.orderedQuantity), deliveredQuantity: candidate.id === itemId ? quantity : new Prisma.Decimal(candidate.deliveredQuantity) })));
          }
          if (status !== currentOrder.status && !isValidStatusTransition(currentOrder.status, status)) throw new HttpError(400, 'Invalid status transition');
          const updatedOrder = status === currentOrder.status ? currentOrder : await tx.order.update({ where: { id: orderId }, data: { status, ...(status === 'DELIVERED' ? { deliveredAt: new Date() } : {}), statusHistory: { create: [{ previousStatus: currentOrder.status, newStatus: status, changedBy: context.userId, reason: action.toUpperCase(), notes: 'Order quantity updated' }] } } });
          if (action === 'delivered-quantity') {
            const delivery = await tx.delivery.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
            if (!delivery) throw new HttpError(409, 'A delivery event must be assigned before recording delivery quantity');
            await tx.delivery.update({
              where: { id: delivery.id },
              data: {
                status: status === 'DELIVERED' ? 'DELIVERED' : 'PARTIALLY_DELIVERED',
                deliveredByUserId: context.userId,
                deliveredAt: status === 'DELIVERED' ? new Date() : delivery.deliveredAt,
                deliveryNotes: input.notes ?? delivery.deliveryNotes,
              },
            });
          }
          return { item: updatedItem, order: updatedOrder, statusChanged: status !== currentOrder.status };
        });
        await audit(database, context.userId, 'UPDATE', 'OrderItem', itemId, { action, quantity: input.quantity, status: updated.statusChanged ? updated.order.status : undefined });
        sendJson(response, 200, updated);
        return true;
      }

      if (method === 'POST' && parts[4] === 'assignment' && parts.length === 5) {
        requirePermission(context, 'orders.place');
        const input = await body(request, assignmentSchema);
        const assignee = await database.user.findUnique({ where: { id: input.userId }, include: { roles: { include: { role: true } } } });
        if (!assignee || assignee.status !== 'ACTIVE' || !assignee.roles.some(({ role }) => role.name === 'DELIVERY_STAFF')) throw new HttpError(400, 'Active delivery staff user is required');
        const address = order.deliveryAddressId ? await database.shopAddress.findUnique({ where: { id: order.deliveryAddressId } }) : null;
        const assigned = await database.$transaction(async (tx) => {
          const delivery = await tx.delivery.create({ data: { orderId, shopId: order.shopId, deliveryAddress: address ? `${address.line1}, ${address.city}, ${address.state} ${address.postalCode}` : 'Address not specified', scheduledAt: input.deliveryDate ?? order.requestedDeliveryDate } });
          const assignment = await tx.deliveryAssignment.create({ data: { deliveryId: delivery.id, userId: input.userId, status: input.status ?? 'ASSIGNED' } });
          const updatedOrder = await tx.order.update({ where: { id: orderId }, data: { assignedAt: new Date(), status: order.status === 'PACKED' ? 'ASSIGNED' : order.status, ...(order.status === 'PACKED' ? { statusHistory: { create: [{ previousStatus: order.status, newStatus: 'ASSIGNED', changedBy: context.userId, reason: 'ASSIGN_DELIVERY', notes: 'Delivery staff assigned' }] } } : {}) } });
          return { delivery, assignment, order: updatedOrder };
        });
        await audit(database, context.userId, 'ASSIGN', 'Delivery', assigned.delivery.id, { orderId, userId: input.userId });
        sendJson(response, 201, assigned);
        return true;
      }

      if (method === 'GET' && parts.length === 4) {
        requirePermission(context, 'orders.read');
        const receivedAmount = order.payments.filter((payment) => payment.status === 'COMPLETED').reduce((total, payment) => total.plus(payment.amount), new Prisma.Decimal(0));
        sendJson(response, 200, {
          ...order,
          delivery: order.deliveries,
          payment: {
            status: receivedAmount.gte(order.totalAmount) ? 'PAID' : 'PENDING',
            amountReceived: receivedAmount,
            outstandingAmount: new Prisma.Decimal(order.totalAmount).minus(receivedAmount).greaterThan(0) ? new Prisma.Decimal(order.totalAmount).minus(receivedAmount) : new Prisma.Decimal(0),
            records: order.payments,
          },
        });
        return true;
      }

      if (method === 'POST' && parts[4] === 'confirm' && parts.length === 5) {


        requirePermission(context, 'orders.update');



        if (order.status !== 'PLACED') {


          throw new HttpError(400, 'Only placed orders can be confirmed');


        }



        const newStatus = 'CONFIRMED';



        if (!isValidStatusTransition(order.status, newStatus)) {


          throw new HttpError(400, 'Invalid status transition');


        }



        const updated = await database.order.update({


          where: { id: orderId },


          data: {


            status: newStatus,


            statusHistory: {


              create: [{


                previousStatus: order.status,


                newStatus,


                changedBy: context.userId,


                reason: 'CONFIRM_ORDER',


                notes: 'Order confirmed by shop or admin',


              }],


            },


          },


          include: {


            items: true,


            statusHistory: true,


          },


        });



        await audit(database, context.userId, 'UPDATE', 'Order', orderId, {


          status: newStatus,


        });



        sendJson(response, 200, updated);


        return true;


      }



      if (method === 'POST' && parts[4] === 'start-picking' && parts.length === 5) {


        requirePermission(context, 'orders.update');



        if (order.status !== 'CONFIRMED') {


          throw new HttpError(400, 'Only confirmed orders can start picking');


        }



        const newStatus = 'PICKING';



        if (!isValidStatusTransition(order.status, newStatus)) {


          throw new HttpError(400, 'Invalid status transition');


        }



        const updated = await database.order.update({


          where: { id: orderId },


          data: {


            status: newStatus,


            statusHistory: {


              create: [{


                previousStatus: order.status,


                newStatus,


                changedBy: context.userId,


                reason: 'START_PICKING',


                notes: 'Order picking started',


              }],


            },


          },


          include: {


            items: true,


            statusHistory: true,


          },


        });



        await audit(database, context.userId, 'UPDATE', 'Order', orderId, {


          status: newStatus,


        });



        sendJson(response, 200, updated);


        return true;


      }



      if (method === 'POST' && parts[4] === 'start-delivery' && parts.length === 5) {



        requirePermission(context, 'orders.update');




        if (order.status !== 'ASSIGNED') {



          throw new HttpError(400, 'Only assigned orders can start delivery');



        }




        const newStatus = 'OUT_FOR_DELIVERY';




        if (!isValidStatusTransition(order.status, newStatus)) {



          throw new HttpError(400, 'Invalid status transition');



        }




        const updated = await database.order.update({



          where: { id: orderId },



          data: {



            status: newStatus,



            statusHistory: {



              create: [{



                previousStatus: order.status,



                newStatus,



                changedBy: context.userId,



                reason: 'START_DELIVERY',



                notes: 'Order is out for delivery',



              }],



            },



          },



          include: {



            items: true,



            statusHistory: true,



          },



        });




        await audit(database, context.userId, 'UPDATE', 'Order', orderId, {



          status: newStatus,



        });




        sendJson(response, 200, updated);



        return true;



      }




      if (method === 'POST' && parts[4] === 'place') {
        requirePermission(context, 'orders.update');
        if (order.status !== 'DRAFT' && order.status !== 'PLACED') {
          throw new HttpError(400, 'Order cannot be placed in its current status');
        }
        const newStatus = 'PLACED';
        if (!isValidStatusTransition(order.status, newStatus)) {
          throw new HttpError(400, 'Invalid status transition');
        }
        const updated = await database.order.update({
          where: { id: orderId },
          data: { status: newStatus, placedAt: new Date(), totalAmount: order.totalAmount, statusHistory: { create: [{ previousStatus: order.status, newStatus, changedBy: context.userId, reason: 'PLACE_ORDER', notes: 'Order placed by shop or admin' }] } },
          include: { items: true, statusHistory: true },
        });
        await audit(database, context.userId, 'UPDATE', 'Order', orderId, { status: newStatus });
        sendJson(response, 200, updated);
        return true;
      }

      if (method === 'POST' && parts[4] === 'cancel') {
        requirePermission(context, 'orders.cancel');
        if (order.status === 'CANCELLED') throw new HttpError(400, 'Order already cancelled');
        const newStatus = 'CANCELLED';
        if (!isValidStatusTransition(order.status, newStatus)) {
          throw new HttpError(400, 'Order cannot be cancelled in its current status');
        }
        const updated = await database.order.update({
          where: { id: orderId },
          data: { status: newStatus, cancelledAt: new Date(), cancellationReason: 'Cancelled by request', statusHistory: { create: [{ previousStatus: order.status, newStatus, changedBy: context.userId, reason: 'CANCEL_ORDER', notes: 'Order cancelled' }] } },
          include: { items: true, statusHistory: true },
        });
        await audit(database, context.userId, 'UPDATE', 'Order', orderId, { status: newStatus });
        sendJson(response, 200, updated);
        return true;
      }

      if (method === 'GET' && parts[4] === 'status-history') {
        requirePermission(context, 'orders.read');
        const history = await database.orderStatusHistory.findMany({ where: { orderId }, orderBy: { createdAt: 'desc' } });
        sendJson(response, 200, history);
        return true;
      }

      if (method === 'POST' && parts[4] === 'reorder') {
        requirePermission(context, 'orders.reorder');
        const warnings: string[] = [];
        const reorderedItems: Array<{ productId: string; variantId?: string; unitId: string; productNameSnapshot: string; variantNameSnapshot: string | null; skuSnapshot: string | null; unitSnapshot: string | null; orderedQuantity: number; unitPrice: number; lineTotal: number; taxRate: number; taxAmount: number; notes: string | null }> = [];
        let subtotal = 0;
        for (const item of order.items) {
          const product = await database.product.findUnique({ where: { id: item.productId }, include: { unit: true, variants: true } });
          const variant = item.variantId ? await database.productVariant.findUnique({ where: { id: item.variantId }, include: { unit: true } }) : null;
          if (!product || product.status !== 'ACTIVE') { warnings.push(`Skipped inactive product: ${item.productId}`); continue; }
          if (item.variantId && variant && variant.status !== 'ACTIVE') { warnings.push(`Skipped inactive variant: ${item.variantId}`); continue; }
          const priceRecord = await database.productPrice.findFirst({
            where: {
              OR: [
                { variantId: item.variantId ?? undefined, shopId: order.shopId },
                { productId: item.productId, shopId: order.shopId },
                { variantId: item.variantId ?? undefined, shopId: null },
                { productId: item.productId, shopId: null },
              ],
            },
            orderBy: { validFrom: 'desc' },
          });
          if (!priceRecord) { warnings.push(`No current price available for ${product.name}`); continue; }
          const q = Number(item.orderedQuantity);
          const price = Number(priceRecord.price);
          const lineTotal = price * q;
          subtotal += lineTotal;
          reorderedItems.push({
            productId: item.productId,
            variantId: item.variantId ?? undefined,
            unitId: item.unitId,
            productNameSnapshot: product.name,
            variantNameSnapshot: variant?.name ?? product.name,
            skuSnapshot: variant?.sku ?? product.sku,
            unitSnapshot: variant?.unit?.code ?? product.unit.code,
            orderedQuantity: q,
            unitPrice: price,
            lineTotal,
            taxRate: 0,
            taxAmount: 0,
            notes: item.notes,
          });
        }
        const created = await database.order.create({
          data: {
            orderNumber: `FM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString().slice(2, 8)}`,
            shopId: order.shopId,
            status: 'DRAFT',
            orderDate: new Date(),
            requestedDeliveryDate: new Date(),
            subtotal,
            taxAmount: 0,
            totalAmount: subtotal,
            items: { create: reorderedItems.map((item) => ({ ...item, orderedQuantity: item.orderedQuantity, unitId: item.unitId })) },
            statusHistory: { create: [{ newStatus: 'DRAFT', changedBy: context.userId, reason: 'REORDER', notes: 'Order recreated from previous order' }] },
          },
          include: { items: true, statusHistory: true },
        });
        sendJson(response, 201, { order: created, warnings });
        return true;
      }
    }

    throw new HttpError(404, 'Order route not found');
  }

  throw new HttpError(404, 'API route not found');
};


