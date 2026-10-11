import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCustomerLedger } from './customer-ledger.js';

const order = (id: string, orderNumber: string, date: string, totalAmount: number, payments: Array<Record<string, unknown>> = []) => ({
  id,
  orderNumber,
  orderDate: new Date(date),
  createdAt: new Date(date),
  totalAmount,
  status: 'DELIVERED',
  payments: payments as never[],
});

test('ledger derives opening, period totals and running balance from charges and collected payments', () => {
  const ledger = buildCustomerLedger([
    order('1', 'RF-1', '2026-10-01T05:00:00Z', 500, [{
      id: 'payment-1', amount: 500, method: 'CASH', status: 'CASH_COLLECTED',
      receivedAt: new Date('2026-10-01T06:00:00Z'), paidAt: null, referenceNumber: null,
      deliveryPartner: { name: 'Suresh' }, receivedBy: null,
    }]),
    order('2', 'RF-2', '2026-10-08T05:00:00Z', 700, [{
      id: 'payment-2', amount: 300, method: 'UPI', status: 'UPI_COLLECTED',
      receivedAt: new Date('2026-10-08T06:00:00Z'), paidAt: null, referenceNumber: 'UPI-REF',
      deliveryPartner: null, receivedBy: { name: 'Admin' },
    }]),
  ], { from: new Date('2026-10-08T00:00:00+05:30'), page: 1, pageSize: 50 });

  assert.deepEqual(ledger.summary, {
    openingBalance: 0,
    totalCharges: 700,
    totalPayments: 300,
    adjustments: 0,
    closingBalance: 400,
  });
  assert.deepEqual(ledger.transactions.map(({ transactionId, balance }) => [transactionId, balance]), [
    ['ORDER-2', 700],
    ['payment-2', 400],
  ]);
  assert.equal(ledger.transactions[1]?.collector, 'Admin');
  assert.equal(ledger.transactions[1]?.referenceNumber, 'UPI-REF');
});

test('ledger excludes uncollected payments and carries pre-period balance forward', () => {
  const ledger = buildCustomerLedger([
    order('1', 'RF-1', '2026-10-01T05:00:00Z', 500, [{
      id: 'payment-pending', amount: 100, method: 'CASH', status: 'PENDING',
      receivedAt: new Date('2026-10-01T06:00:00Z'), paidAt: null, referenceNumber: null,
      deliveryPartner: null, receivedBy: null,
    }]),
    order('2', 'RF-2', '2026-10-08T05:00:00Z', 700),
  ], { from: new Date('2026-10-08T00:00:00+05:30'), page: 1, pageSize: 1 });

  assert.deepEqual(ledger.summary, {
    openingBalance: 500,
    totalCharges: 700,
    totalPayments: 0,
    adjustments: 0,
    closingBalance: 1200,
  });
  assert.equal(ledger.pagination.total, 1);
  assert.equal(ledger.transactions[0]?.balance, 1200);
});
