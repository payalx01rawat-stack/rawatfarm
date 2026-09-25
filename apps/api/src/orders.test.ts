import assert from 'node:assert/strict';
import test from 'node:test';

import { Prisma } from '@farmmitra/database';
import { calculateDeliveryDate, deriveDeliveryStatus, isValidStatusTransition, ORDER_STATUSES, orderItemSchema, orderSchema, quantityValidationError } from './orders.js';

test('order schema validates positive fractional quantities and delivery date', () => {
  const result = orderSchema.safeParse({
    shopId: 'cmg1234567890abc',
    deliveryAddressId: 'cmg1234567890abd',
    requestedDeliveryDate: '2026-09-14',
    notes: 'Urgent',
    items: [
      {
        productId: 'cmg1234567890abe',
        variantId: 'cmg1234567890abf',
        quantity: 18.65,
        unitId: 'cmg1234567890ac0',
      },
    ],
  });

  assert.equal(result.success, true);
});

test('delivery cutoff remains before the business cut-off time', () => {
  const date = new Date('2026-09-13T22:30:00+05:30');
  const nextDate = calculateDeliveryDate(date, '23:00', 'Asia/Kolkata');
  assert.equal(nextDate.toISOString(), new Date('2026-09-14T00:00:00.000Z').toISOString());
});

test('status transitions reject invalid changes', () => {
  assert.equal(isValidStatusTransition('PLACED', 'PACKED'), false);
  assert.equal(isValidStatusTransition('PLACED', 'CONFIRMED'), true);
  assert.equal(isValidStatusTransition('OUT_FOR_DELIVERY', 'DELIVERED'), true);
  assert.equal(isValidStatusTransition('DELIVERED', 'CANCELLED'), false);
});

test('order item schema rejects zero or negative quantities', () => {
  const result = orderItemSchema.safeParse({
    productId: 'cmg1234567890abe',
    variantId: 'cmg1234567890abf',
    quantity: 0,
    unitId: 'cmg1234567890ac0',
  });

  assert.equal(result.success, false);
});

test('quantity invariants support fractional fulfillment and reject invalid totals', () => {
  const ordered = new Prisma.Decimal('20');
  const packed = new Prisma.Decimal('20');
  const delivered = new Prisma.Decimal('18.65');

  assert.equal(quantityValidationError('delivered-quantity', delivered, ordered, packed, new Prisma.Decimal('0')), null);
  assert.equal(quantityValidationError('delivered-quantity', new Prisma.Decimal('20.01'), ordered, packed, new Prisma.Decimal('0')), 'Delivered quantity cannot exceed ordered quantity');
  assert.equal(quantityValidationError('returned-quantity', new Prisma.Decimal('18.66'), ordered, packed, delivered), 'Returned quantity cannot exceed delivered quantity');
  assert.equal(quantityValidationError('packed-quantity', new Prisma.Decimal('20.01'), ordered, packed, delivered), 'Packed quantity cannot exceed ordered quantity');
});

test('fractional delivery transitions from partial to final delivery', () => {
  const ordered = new Prisma.Decimal('20');
  assert.equal(deriveDeliveryStatus('OUT_FOR_DELIVERY', [{ orderedQuantity: ordered, deliveredQuantity: new Prisma.Decimal('18.65') }]), 'PARTIALLY_DELIVERED');
  assert.equal(deriveDeliveryStatus('PARTIALLY_DELIVERED', [{ orderedQuantity: ordered, deliveredQuantity: new Prisma.Decimal('20') }]), 'DELIVERED');
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const allStatuses = ORDER_STATUSES;
