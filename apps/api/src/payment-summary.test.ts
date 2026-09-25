import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPaymentSummary } from './payment-summary.js';
import { paymentCollectionSchema } from './schemas.js';

test('payment summary preserves partial cash and UPI collections', () => {
  const summary = buildPaymentSummary(2000, [
    { amount: 1000, method: 'CASH', status: 'CASH_COLLECTED', receivedAt: '2026-09-25T08:00:00.000Z' },
    { amount: 1000, method: 'UPI', status: 'UPI_COLLECTED', receivedAt: '2026-09-25T16:00:00.000Z' },
  ], '2026-09-25T07:00:00.000Z', new Date('2026-09-25T17:00:00.000Z'));

  assert.deepEqual(summary, {
    orderTotal: 2000,
    collected: 2000,
    outstanding: 0,
    cashCollected: 1000,
    upiCollected: 1000,
    status: 'PAID',
    lastPaymentAt: new Date('2026-09-25T16:00:00.000Z'),
    daysOutstanding: 0,
    overdue: false,
  });
});

test('payment summary marks seven-day unpaid balances overdue', () => {
  const summary = buildPaymentSummary(2000, [{ amount: 1000, method: 'CASH', status: 'CASH_COLLECTED', receivedAt: '2026-09-18T08:00:00.000Z' }], '2026-09-18T08:00:00.000Z', new Date('2026-09-25T08:00:00.000Z'));

  assert.equal(summary.collected, 1000);
  assert.equal(summary.outstanding, 1000);
  assert.equal(summary.status, 'PARTIALLY_PAID');
  assert.equal(summary.daysOutstanding, 7);
  assert.equal(summary.overdue, true);
});

test('payment collection rejects zero or negative amounts', () => {
  assert.equal(paymentCollectionSchema.safeParse({ method: 'CASH', amount: 0 }).success, false);
  assert.equal(paymentCollectionSchema.safeParse({ method: 'UPI', amount: -1 }).success, false);
});
