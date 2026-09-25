export const COLLECTED_PAYMENT_STATUSES = new Set(['COMPLETED', 'CASH_COLLECTED', 'UPI_COLLECTED']);

export type PaymentRecord = {
  amount: number | string | { toString(): string };
  method?: string | null;
  status?: string | null;
  receivedAt?: Date | string | null;
  paidAt?: Date | string | null;
};

export type PaymentSummary = {
  orderTotal: number;
  collected: number;
  outstanding: number;
  cashCollected: number;
  upiCollected: number;
  status: 'PAYMENT_PENDING' | 'PARTIALLY_PAID' | 'PAID';
  lastPaymentAt: Date | null;
  daysOutstanding: number;
  overdue: boolean;
};

export const isCollectedPayment = (payment: Pick<PaymentRecord, 'status'>): boolean => Boolean(payment.status && COLLECTED_PAYMENT_STATUSES.has(payment.status));

export const buildPaymentSummary = (orderTotalInput: number | string | { toString(): string }, payments: PaymentRecord[], orderDate: Date | string, now = new Date()): PaymentSummary => {
  const orderTotal = Math.max(0, Number(orderTotalInput) || 0);
  const collectedPayments = payments.filter(isCollectedPayment);
  const collected = collectedPayments.reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0);
  const cashCollected = collectedPayments.filter((payment) => payment.method === 'CASH').reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0);
  const upiCollected = collectedPayments.filter((payment) => payment.method === 'UPI').reduce((sum, payment) => sum + Math.max(0, Number(payment.amount) || 0), 0);
  const outstanding = Math.max(0, orderTotal - collected);
  const dates = collectedPayments.map((payment) => payment.receivedAt ?? payment.paidAt).filter((value): value is Date | string => Boolean(value)).map((value) => new Date(value).getTime()).filter((value) => Number.isFinite(value));
  const lastPaymentAt = dates.length > 0 ? new Date(Math.max(...dates)) : null;
  const anchor = lastPaymentAt ?? new Date(orderDate);
  const daysOutstanding = outstanding > 0 && Number.isFinite(anchor.getTime()) ? Math.max(0, Math.floor((now.getTime() - anchor.getTime()) / 86_400_000)) : 0;

  return {
    orderTotal,
    collected,
    outstanding,
    cashCollected,
    upiCollected,
    status: outstanding === 0 && orderTotal > 0 ? 'PAID' : collected > 0 ? 'PARTIALLY_PAID' : 'PAYMENT_PENDING',
    lastPaymentAt,
    daysOutstanding,
    overdue: outstanding > 0 && daysOutstanding >= 7,
  };
};
