import assert from 'node:assert/strict';
import test from 'node:test';

import { Prisma } from '@farmmitra/database';
import { calculateAvailableQuantity, isReservationActionAllowed, parseDecimalQuantity } from './inventory.js';

test('inventory calculates available stock with reserved quantities while preserving decimals', () => {
  const onHand = new Prisma.Decimal('10.500');
  const reserved = new Prisma.Decimal('2.250');

  const available = calculateAvailableQuantity(onHand, reserved);
  assert.ok(available.equals(new Prisma.Decimal('8.25')));
  assert.ok(parseDecimalQuantity('1.250').equals(new Prisma.Decimal('1.25')));
  assert.ok(parseDecimalQuantity('0.001').equals(new Prisma.Decimal('0.001')));
});

test('reservation actions reject duplicate release and consume transitions', () => {
  assert.equal(isReservationActionAllowed('ACTIVE', 'release'), true);
  assert.equal(isReservationActionAllowed('ACTIVE', 'consume'), true);
  assert.equal(isReservationActionAllowed('RELEASED', 'release'), false);
  assert.equal(isReservationActionAllowed('CONSUMED', 'consume'), false);
  assert.equal(isReservationActionAllowed('EXPIRED', 'consume'), false);
});
