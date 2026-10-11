"use client"

import { use, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminSidebar } from "../../components/AdminSidebar"
import { clearAdminSession, fetchAdminJson, formatCurrency, formatDate, formatTime } from "../../lib/admin-api"
import { useTranslation } from "@farmmitra/shared-utils/src/LanguageProvider"

type Address = { id: string; label?: string | null; line1: string; line2?: string | null; city: string; state: string; postalCode: string }
type Payment = { id: string; orderId: string; orderNumber: string; amount: number | string; method: string; status: string; referenceNumber?: string | null; paymentDate?: string | null; receivedBy?: string | null }
type Order = {
  id: string
  orderNumber: string
  orderDate?: string | null
  createdAt?: string | null
  totalAmount: number | string
  status: string
  paymentCollected: number
  outstanding: number
  paymentMethods: string[]
  deliveryStatus?: string | null
  items: Array<{ id: string; productNameSnapshot?: string | null; variantNameSnapshot?: string | null; orderedQuantity: number | string; unitPrice: number | string; unitSnapshot?: string | null; lineTotal: number | string }>
}
type FinancialHistory = {
  customer: { id: string; name: string; email?: string | null; mobile?: string | null; mobile2?: string | null; addresses: Address[] }
  summary: { totalOrders: number; totalOrderValue: number; totalPaid: number; outstanding: number }
  payments: Payment[]
  orders: Order[]
  ledger?: {
    summary: { openingBalance: number; totalCharges: number; totalPayments: number; adjustments: number; closingBalance: number }
    transactions: Array<{ transactionId: string; date: string; description: string; orderNumber: string; debit: number; credit: number; balance: number; method: string | null; collector: string | null; referenceNumber: string | null; status: string }>
  }
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { t } = useTranslation()
  const [history, setHistory] = useState<FinancialHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  async function loadHistory() {
    setLoading(true)
    setError("")
    try {
      setHistory(await fetchAdminJson<FinancialHistory>(`/api/v1/users/${encodeURIComponent(id)}/financial-history`))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load customer history")
      if (reason instanceof Error && reason.message.includes("session")) {
        clearAdminSession()
        router.push("/")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadHistory() }, [id])

  return (
    <main className="app-shell">
      <AdminSidebar />
      <section className="main-content">
        <header className="topbar">
          <div><h1>{t("customerDetails")}</h1><p>{t("customerHistoryDescription")}</p></div>
          <button className="top-logout" onClick={() => router.push("/customers")}>{t("backToCustomers")}</button>
        </header>
        <div className="content">
          {error && <div className="message error" role="alert">{error}<button onClick={() => void loadHistory()}>{t("tryAgain")}</button></div>}
          {loading ? <div className="empty-state">{t("loading")}</div> : !history ? <div className="empty-state">{t("noRecords")}</div> : (
            <>
              <section className="panel">
                <div className="panel-header"><div><h3>{t("customerSummary")}</h3><p>{t("contactInfoAndAddresses")}</p></div></div>
                <div className="customer-summary-grid">
                  <div><span>{t("name")}</span><strong>{history.customer.name}</strong></div>
                  <div><span>{t("mobile")}</span><strong>{history.customer.mobile || "—"}</strong></div>
                  <div><span>{t("email")}</span><strong>{history.customer.email || "—"}</strong></div>
                  <div className="customer-address"><span>{t("address")}</span>{history.customer.addresses.length ? history.customer.addresses.map((address) => <p key={address.id}>{address.label ? `${address.label}: ` : ""}{[address.line1, address.line2, address.city, address.state, address.postalCode].filter(Boolean).join(", ")}</p>) : <strong>—</strong>}</div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-header"><div><h3>{t("financialSummary")}</h3><p>{t("customerHistoryDescription")}</p></div></div>
                <div className="stats-grid customer-financial-grid">
                  <div className="stat-card"><div><span>{t("totalOrders")}</span><strong>{history.summary.totalOrders}</strong></div></div>
                  <div className="stat-card"><div><span>{t("totalOrderValue")}</span><strong>{formatCurrency(history.summary.totalOrderValue)}</strong></div></div>
                  <div className="stat-card"><div><span>{t("totalPaid")}</span><strong>{formatCurrency(history.summary.totalPaid)}</strong></div></div>
                  <div className="stat-card"><div><span>{t("totalPending")}</span><strong>{formatCurrency(history.summary.outstanding)}</strong></div></div>
                </div>
              </section>

              {history.ledger && <section className="panel">
                <div className="panel-header"><div><h3>{t("customerKhata")}</h3><p>{t("openingBalanceNote")}</p></div></div>
                <div className="customer-financial-grid stats-grid">
                  <div className="stat-card"><span>{t("openingBalance")}</span><strong>{formatCurrency(history.ledger.summary.openingBalance)}</strong></div>
                  <div className="stat-card"><span>{t("totalCharges")}</span><strong>{formatCurrency(history.ledger.summary.totalCharges)}</strong></div>
                  <div className="stat-card"><span>{t("totalPayments")}</span><strong>{formatCurrency(history.ledger.summary.totalPayments)}</strong></div>
                  <div className="stat-card"><span>{t("closingBalance")}</span><strong>{formatCurrency(history.ledger.summary.closingBalance)}</strong></div>
                </div>
                {history.ledger.transactions.length > 0 && <div className="table-wrap"><table>
                  <thead><tr><th>{t("date")} / {t("time")}</th><th>{t("transactionId")}</th><th>{t("description")}</th><th>{t("orderNumber")}</th><th>{t("debit")}</th><th>{t("credit")}</th><th>{t("closingBalance")}</th><th>{t("paymentMethod")}</th><th>{t("collectedBy")}</th><th>{t("reference")}</th></tr></thead>
                  <tbody>{history.ledger.transactions.map((transaction) => <tr key={transaction.transactionId}>
                    <td>{formatDate(transaction.date)} {formatTime(transaction.date)} IST</td><td>{transaction.transactionId}</td><td>{transaction.description}</td><td>{transaction.orderNumber}</td>
                    <td>{transaction.debit ? formatCurrency(transaction.debit) : "—"}</td><td>{transaction.credit ? formatCurrency(transaction.credit) : "—"}</td><td>{formatCurrency(transaction.balance)}</td>
                    <td>{transaction.method || "—"}</td><td>{transaction.collector || "—"}</td><td>{transaction.referenceNumber || "—"}</td>
                  </tr>)}</tbody>
                </table></div>}
              </section>}

              <section className="panel">
                <div className="panel-header"><div><h3>{t("paymentHistory")}</h3><p>{t("recordedPayments", { count: history.payments.length })}</p></div></div>
                {!history.payments.length ? <div className="empty-state">{t("noCustomerPayments")}</div> : (
                  <div className="table-wrap"><table>
                    <thead><tr><th>{t("paymentDate")}</th><th>{t("time")} (IST)</th><th>{t("order")}</th><th>{t("amount")}</th><th>{t("method")}</th><th>{t("upiReference")}</th><th>{t("status")}</th><th>{t("collectedBy")}</th></tr></thead>
                    <tbody>{history.payments.map((payment) => <tr key={payment.id}>
                      <td>{formatDate(payment.paymentDate)}</td><td>{formatTime(payment.paymentDate)}</td>
                      <td><button className="customer-link" onClick={() => router.push(`/orders/${payment.orderId}`)}>{payment.orderNumber}</button></td>
                      <td><strong>{formatCurrency(payment.amount)}</strong></td><td>{payment.method}</td>
                      <td>{payment.method === "UPI" ? payment.referenceNumber || "—" : "—"}</td>
                      <td><span className={`status ${payment.status.toLowerCase()}`}>{payment.status.replaceAll("_", " ")}</span></td>
                      <td>{payment.receivedBy || "—"}</td>
                    </tr>)}</tbody>
                  </table></div>
                )}
              </section>

              <section className="panel">
                <div className="panel-header"><div><h3>{t("orderHistory")}</h3><p>{t("rawatFarmOrders", { count: history.orders.length })}</p></div></div>
                {!history.orders.length ? <div className="empty-state">{t("noCustomerOrders")}</div> : (
                  <div className="customer-order-list">{history.orders.map((order) => (
                    <article className="customer-order" key={order.id}>
                      <div className="customer-order-heading">
                        <div><button className="customer-link" onClick={() => router.push(`/orders/${order.id}`)}>{order.orderNumber}</button><p>{formatDate(order.orderDate || order.createdAt)} · {formatTime(order.orderDate || order.createdAt)} IST</p></div>
                        <span className={`status ${order.status.toLowerCase()}`}>{order.status.replaceAll("_", " ")}</span>
                      </div>
                      <div className="table-wrap"><table>
                        <thead><tr><th>{t("product")}</th><th>{t("quantity")}</th><th>{t("pricePerItem")}</th><th>{t("lineTotal")}</th></tr></thead>
                        <tbody>{order.items.map((item) => <tr key={item.id}>
                          <td>{item.productNameSnapshot || item.variantNameSnapshot || "Product"}</td>
                          <td>{item.orderedQuantity} {item.unitSnapshot || ""}</td>
                          <td>{formatCurrency(item.unitPrice)}{item.unitSnapshot ? ` / ${item.unitSnapshot}` : ""}</td>
                          <td>{formatCurrency(item.lineTotal)}</td>
                        </tr>)}</tbody>
                      </table></div>
                      <div className="customer-order-totals">
                        <span>{t("orderTotal")} <strong>{formatCurrency(order.totalAmount)}</strong></span>
                        <span>{t("paymentCollected")} <strong>{formatCurrency(order.paymentCollected)}</strong></span>
                        <span>{t("outstanding")} <strong>{formatCurrency(order.outstanding)}</strong></span>
                        <span>{t("paymentMethod")} <strong>{order.paymentMethods.join(", ") || "—"}</strong></span>
                        <span>{t("deliveryStatus")} <strong>{order.deliveryStatus || t("notAssigned")}</strong></span>
                      </div>
                    </article>
                  ))}</div>
                )}
              </section>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
