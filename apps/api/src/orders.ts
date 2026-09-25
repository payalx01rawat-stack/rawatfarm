import { createHash } from 'node:crypto';
import { Prisma } from '@farmmitra/database';
import { z } from 'zod';

export const ORDER_STATUSES = [
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
  'RETURNED',
] as const;

export type OrderStatusName = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatusName, OrderStatusName[]> = {
  DRAFT: ['PLACED'],
  PLACED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PICKING', 'CANCELLED'],
  PICKING: ['PACKED'],
  PACKED: ['ASSIGNED'],
  ASSIGNED: ['OUT_FOR_DELIVERY'],
  OUT_FOR_DELIVERY: ['PARTIALLY_DELIVERED', 'DELIVERED'],
  PARTIALLY_DELIVERED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  RETURNED: [],
};

export const isValidStatusTransition = (fromStatus: string, toStatus: string): boolean => {
  const allowed = ORDER_STATUS_TRANSITIONS[fromStatus as OrderStatusName] ?? [];
  return allowed.includes(toStatus as OrderStatusName);
};

export type QuantityChange = 'packed-quantity' | 'delivered-quantity' | 'returned-quantity';

export const quantityValidationError = (change: QuantityChange, quantity: Prisma.Decimal, ordered: Prisma.Decimal, packed: Prisma.Decimal, delivered: Prisma.Decimal): string | null => {
  if (quantity.isNegative()) return 'Quantity cannot be negative';
  if (change === 'packed-quantity' && quantity.gt(ordered)) return 'Packed quantity cannot exceed ordered quantity';
  if (change === 'delivered-quantity' && quantity.gt(ordered)) return 'Delivered quantity cannot exceed ordered quantity';
  if (change === 'delivered-quantity' && quantity.gt(packed)) return 'Delivered quantity cannot exceed packed quantity';
  if (change === 'returned-quantity' && quantity.gt(delivered)) return 'Returned quantity cannot exceed delivered quantity';
  return null;
};

export const deriveDeliveryStatus = (currentStatus: string, items: Array<{ orderedQuantity: Prisma.Decimal; deliveredQuantity: Prisma.Decimal }>): OrderStatusName => {
  if (!items.some((item) => new Prisma.Decimal(item.deliveredQuantity).gt(0))) return currentStatus as OrderStatusName;
  return items.every((item) => new Prisma.Decimal(item.deliveredQuantity).gte(new Prisma.Decimal(item.orderedQuantity))) ? 'DELIVERED' : 'PARTIALLY_DELIVERED';
};

const positiveDecimal = z.coerce.number().finite().gt(0);
export const orderItemSchema = z.object({
  productId: z.string().trim().min(1),
  variantId: z.string().trim().min(1).optional(),
  unitId: z.string().trim().min(1).optional(),
  quantity: positiveDecimal,
  notes: z.string().trim().max(500).optional(),
}).strict();

export const orderSchema = z.object({
  shopId: z.string().trim().min(1).optional(),
  deliveryAddressId: z.string().trim().min(1).optional(),
  requestedDeliveryDate: z.union([
    z.string().trim().min(1),
    z.number(),
    z.coerce.date(),
  ]).optional(),
  notes: z.string().trim().max(1000).optional(),
  customerNotes: z.string().trim().max(1000).optional(),
  internalNotes: z.string().trim().max(1000).optional(),
  items: z.array(orderItemSchema).min(1),
}).strict();

const pad2 = (value: number): string => String(value).padStart(2, '0');

export const calculateDeliveryDate = (currentDate: Date, cutoffTime: string, timeZone: string): Date => {
  const [hours = '0', minutes = '0'] = cutoffTime.split(':');
  const cutoffMinutes = Number(hours) * 60 + Number(minutes);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(currentDate);

  const lookup = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const localYear = Number(lookup.year);
  const localMonth = Number(lookup.month);
  const localDay = Number(lookup.day);
  const localHour = Number(lookup.hour);
  const localMinute = Number(lookup.minute);
  const localSecond = Number(lookup.second);
  const localTotalMinutes = localHour * 60 + localMinute + localSecond / 60;

  const daysAhead = localTotalMinutes < cutoffMinutes ? 1 : 2;
  const nextDate = new Date(Date.UTC(localYear, localMonth - 1, localDay + daysAhead, 0, 0, 0));

  return nextDate;
};

export const buildOrderNumber = (): string => {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const sequence = Math.floor(Math.random() * 900000 + 100000);
  return `FM-${datePart}-${sequence}`;
};

export const DEFAULT_ORDER_CUTOFF = '23:00';
export const DEFAULT_ORDER_TIMEZONE = 'Asia/Kolkata';

export const parseRequestedDeliveryDate = (value: unknown, fallbackDate?: Date): Date | null => {
  if (value === undefined || value === null || value === '') return fallbackDate ?? null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return fallbackDate ?? null;
  return parsed;
};

export const asMoney = (input: number | string): string => {
  const numeric = typeof input === 'number' ? input : Number(input ?? 0);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';
};

export const hashRequestPayload = (payload: unknown): string => createHash('sha256').update(JSON.stringify(payload)).digest('hex');
