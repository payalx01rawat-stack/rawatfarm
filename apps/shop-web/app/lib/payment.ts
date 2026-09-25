const collectedStatuses = new Set(["COMPLETED", "CASH_COLLECTED", "UPI_COLLECTED"])

export function isPaymentCollected(status?: string): boolean {
  return Boolean(status && collectedStatuses.has(status))
}
