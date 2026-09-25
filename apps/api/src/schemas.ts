import { z } from 'zod';
import { orderItemSchema } from './orders.js';

const id = z.string().cuid();
const password = z.string().min(8).max(128);
const decimal = z.coerce.number().finite().nonnegative();

const registerFields = { name: z.string().trim().min(2).max(191), email: z.string().email().optional(), mobile: z.string().trim().min(7).max(30).optional(), password, preferredLanguage: z.enum(['en', 'hi']).default('en') };
export const registerSchema = z.object(registerFields).refine((value) => value.email || value.mobile, { message: 'Email or mobile is required' });
export const loginSchema = z.object({ identifier: z.string().trim().min(3), password });
export const userCreateSchema = z.object({ ...registerFields, roleNames: z.array(z.string().min(1)).default([]) }).refine((value) => value.email || value.mobile, { message: 'Email or mobile is required' });
export const userUpdateSchema = z.object({ name: z.string().trim().min(2).max(191).optional(), email: z.string().email().nullable().optional(), mobile: z.string().trim().min(7).max(30).nullable().optional(), password: password.optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional(), preferredLanguage: z.enum(['en', 'hi']).optional() });
export const languageSchema = z.enum(['en', 'hi']);
export const quantitySchema = z.object({ quantity: z.coerce.number().finite().nonnegative(), notes: z.string().trim().max(1000).optional() });
export const assignmentSchema = z.object({ userId: id, deliveryDate: z.coerce.date().optional(), status: z.string().trim().min(1).max(30).optional() });
export const shopUserSchema = z.object({ userId: id });
export const roleSchema = z.object({ roleName: z.string().min(1) });
export const shopSchema = z.object({ name: z.string().trim().min(2).max(191), ownerName: z.string().trim().max(191).optional(), primaryMobile: z.string().trim().min(7).max(30), whatsappNumber: z.string().trim().max(30).optional(), taxNumber: z.string().trim().max(191).optional(), isActive: z.boolean().optional() });
export const warehouseSchema = z.object({ branchId: id, name: z.string().trim().min(2).max(191), code: z.string().trim().min(2).max(50), isActive: z.boolean().optional() });
export const contactSchema = z.object({ label: z.string().trim().max(191).optional(), phone: z.string().trim().min(7).max(30), isPrimary: z.boolean().optional() });
export const addressSchema = z.object({ type: z.enum(['BILLING', 'SHIPPING', 'BOTH']), line1: z.string().trim().min(1).max(191), line2: z.string().trim().max(191).optional(), city: z.string().trim().min(1).max(191), state: z.string().trim().min(1).max(191), postalCode: z.string().trim().min(3).max(30) });
export const creditSchema = z.object({ creditLimit: decimal, paymentTermsDays: z.number().int().nonnegative().max(365), isBlocked: z.boolean().optional() });
export const categorySchema = z.object({ name: z.string().trim().min(2).max(191), description: z.string().trim().max(191).optional(), isActive: z.boolean().optional() });
export const unitSchema = z.object({ name: z.string().trim().min(1).max(191), code: z.string().trim().min(1).max(30), precision: z.number().int().nonnegative().max(6), isActive: z.boolean().optional() });
export const productSchema = z.object({ categoryId: id, unitId: id, name: z.string().trim().min(2).max(191), sku: z.string().trim().min(1).max(191), description: z.string().trim().max(191).optional(), imageUrl: z.string().url().nullable().optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional(), minOrderQuantity: decimal.optional() });
export const productUpdateSchema = productSchema.partial();
export const variantSchema = z.object({ productId: id, unitId: id, name: z.string().trim().min(1).max(191), sku: z.string().trim().min(1).max(191), status: z.enum(['ACTIVE', 'INACTIVE']).optional() });
export const priceSchema = z.object({ productId: id.optional(), variantId: id.optional(), shopId: id.optional(), price: decimal, minQuantity: decimal.optional(), validFrom: z.coerce.date(), validTo: z.coerce.date().nullable().optional() }).refine((value) => value.productId || value.variantId, { message: 'Product or variant is required' });
export const customerAddressSchema = z.object({ label: z.string().trim().max(80).optional(), line1: z.string().trim().min(1).max(191), line2: z.string().trim().max(191).optional(), city: z.string().trim().min(1).max(191), state: z.string().trim().min(1).max(191), postalCode: z.string().trim().min(3).max(30) });
export const vendorSchema = z.object({ name: z.string().trim().min(2).max(191), imageUrl: z.string().url().optional(), contactPhone: z.string().trim().max(30).optional(), contactEmail: z.string().email().optional(), address: z.string().trim().max(500).optional(), upiId: z.string().trim().max(191).nullable().optional(), paymentDisplayName: z.string().trim().max(191).nullable().optional(), qrImageUrl: z.string().url().nullable().optional(), cashCollectionEnabled: z.boolean().optional(), upiCollectionEnabled: z.boolean().optional(), paymentInstructions: z.string().trim().max(1000).nullable().optional(), isActive: z.boolean().optional() });
export const vendorSettingsSchema = vendorSchema.partial();
export const adminVendorCreateSchema = z.object({ businessName: z.string().trim().min(2).max(191), ownerName: z.string().trim().min(2).max(191), email: z.string().email(), phone: z.string().trim().min(7).max(30), address: z.string().trim().min(1).max(500), password: z.string().min(8).max(128) });
export const vendorStatusSchema = z.object({ status: z.enum(['PENDING', 'APPROVED', 'SUSPENDED']) });
export const marketplaceOrderSchema = z.object({ items: z.array(orderItemSchema).min(1), notes: z.string().trim().max(1000).optional(), addressId: id.optional(), deliveryAddress: customerAddressSchema.optional() }).strict();
export const paymentCollectionSchema = z.object({ method: z.enum(['CASH', 'UPI']), amount: z.coerce.number().finite().gt(0), referenceNumber: z.string().trim().max(191).optional(), notes: z.string().trim().max(1000).optional() });
export const deliveryCompletionSchema = z.object({ payment: z.enum(['PAID_ONLINE', 'CASH', 'UPI', 'NOT_RECEIVED']).default('NOT_RECEIVED'), amount: decimal.optional(), referenceNumber: z.string().trim().max(191).optional(), notes: z.string().trim().max(1000).optional() });
export const deliveryPartnerSchema = z.object({ userId: id, capabilities: z.array(z.enum(['DELIVERY', 'PAYMENT_COLLECTION'])).default(['DELIVERY']) });
export const deliveryPartnerUpdateSchema = z.object({ capabilities: z.array(z.enum(['DELIVERY', 'PAYMENT_COLLECTION'])).optional(), isActive: z.boolean().optional() }).strict();
export const inventoryAdjustmentSchema = z.object({ warehouseId: id, variantId: id, quantity: z.coerce.number().finite().gt(0), direction: z.enum(['INCREASE', 'DECREASE']).default('INCREASE'), reason: z.string().trim().min(1).max(191), notes: z.string().trim().max(1000).optional(), referenceType: z.string().trim().max(80).optional(), referenceId: z.string().trim().max(191).optional() });
export const inventoryReceiptSchema = z.object({ warehouseId: id, variantId: id, quantity: z.coerce.number().finite().gt(0), referenceType: z.string().trim().max(80).optional(), referenceId: z.string().trim().max(191).optional(), notes: z.string().trim().max(1000).optional() });
export const inventoryIssueSchema = z.object({ warehouseId: id, variantId: id, quantity: z.coerce.number().finite().gt(0), referenceType: z.string().trim().max(80).optional(), referenceId: z.string().trim().max(191).optional(), notes: z.string().trim().max(1000).optional() });
export const inventoryTransferSchema = z.object({ fromWarehouseId: id, toWarehouseId: id, variantId: id, quantity: z.coerce.number().finite().gt(0), reason: z.string().trim().min(1).max(191).optional(), notes: z.string().trim().max(1000).optional() }).refine((value) => value.fromWarehouseId !== value.toWarehouseId, { message: 'Source and destination warehouse must differ' });

export const parse = <T>(schema: z.ZodSchema<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues.map((issue) => issue.message).join('; '));
  return result.data;
};

export const farmerCreateSchema = z.object({
  userId: id,
  farmerCode: z.string().trim().min(2).max(50),
  village: z.string().trim().max(191).optional(),
  district: z.string().trim().max(191).optional(),
  state: z.string().trim().max(191).optional(),
  pincode: z.string().trim().max(20).optional(),
  landArea: decimal.optional(),
  landUnit: z.string().trim().max(30).optional(),
  experienceYears: z.number().int().nonnegative().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export const farmerUpdateSchema = z.object({
  farmerCode: z.string().trim().min(2).max(50).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  village: z.string().trim().max(191).nullable().optional(),
  district: z.string().trim().max(191).nullable().optional(),
  state: z.string().trim().max(191).nullable().optional(),
  pincode: z.string().trim().max(20).nullable().optional(),
  landArea: decimal.nullable().optional(),
  landUnit: z.string().trim().max(30).nullable().optional(),
  experienceYears: z.number().int().nonnegative().max(100).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
