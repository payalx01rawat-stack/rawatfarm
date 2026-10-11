type LedgerPayment = {
  id: string;
  amount: number | string | { toString(): string };
  method: string;
  status: string;
  referenceNumber: string | null;
  receivedAt: Date | null;
  paidAt: Date | null;
  deliveryPartner: { name: string } | null;
  receivedBy: { name: string } | null;
};

type LedgerOrder = {
  id: string;
  orderNumber: string;
  orderDate: Date;
  createdAt: Date;
  totalAmount: number | string | { toString(): string };
  status: string;
  payments: LedgerPayment[];
};

type LedgerEvent = {
  transactionId: string;
  date: Date;
  description: string;
  orderId: string;
  orderNumber: string;
  debit: number;
  credit: number;
  method: string | null;
  collector: string | null;
  referenceNumber: string | null;
  status: string;
  sequence: number;
};

const collectedStatuses = new Set(['COMPLETED', 'CASH_COLLECTED', 'UPI_COLLECTED']);

export type CustomerLedgerFilter = {
  from?: Date;
  toExclusive?: Date;
  page: number;
  pageSize: number;
};

export function buildCustomerLedger(orders: LedgerOrder[], filter: CustomerLedgerFilter) {
  const events: LedgerEvent[] = [];
  for (const order of orders) {
    events.push({
      transactionId: `ORDER-${order.id}`,
      date: order.orderDate ?? order.createdAt,
      description: 'Order charge',
      orderId: order.id,
      orderNumber: order.orderNumber,
      debit: Number(order.totalAmount),
      credit: 0,
      method: null,
      collector: null,
      referenceNumber: null,
      status: order.status,
      sequence: 0,
    });
    for (const payment of order.payments) {
      if (!collectedStatuses.has(payment.status)) continue;
      events.push({
        transactionId: payment.id,
        date: payment.receivedAt ?? payment.paidAt ?? order.orderDate ?? order.createdAt,
        description: 'Payment received',
        orderId: order.id,
        orderNumber: order.orderNumber,
        debit: 0,
        credit: Number(payment.amount),
        method: payment.method,
        collector: payment.deliveryPartner?.name ?? payment.receivedBy?.name ?? null,
        referenceNumber: payment.referenceNumber,
        status: payment.status,
        sequence: 1,
      });
    }
  }
  events.sort((left, right) => left.date.getTime() - right.date.getTime()
    || left.sequence - right.sequence
    || left.transactionId.localeCompare(right.transactionId));

  let balance = 0;
  const withBalances = events.map((event) => {
    balance += event.debit - event.credit;
    return { ...event, balance };
  });
  const selected = withBalances.filter(({ date }) =>
    (!filter.from || date >= filter.from) && (!filter.toExclusive || date < filter.toExclusive));
  const openingBalance = filter.from
    ? withBalances.filter(({ date }) => date < filter.from!).reduce((current, event) => current + event.debit - event.credit, 0)
    : 0;
  const totalCharges = selected.reduce((sum, event) => sum + event.debit, 0);
  const totalPayments = selected.reduce((sum, event) => sum + event.credit, 0);
  const pageCount = Math.max(1, Math.ceil(selected.length / filter.pageSize));
  const page = Math.min(filter.page, pageCount);
  const offset = (page - 1) * filter.pageSize;

  return {
    summary: {
      openingBalance,
      totalCharges,
      totalPayments,
      adjustments: 0,
      closingBalance: openingBalance + totalCharges - totalPayments,
    },
    transactions: selected.slice(offset, offset + filter.pageSize),
    pagination: { page, pageSize: filter.pageSize, total: selected.length, pages: pageCount },
  };
}
