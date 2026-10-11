"use client"

import { useEffect, useMemo, useState } from "react"
import { fetchAdminJson, formatCurrency, formatDateTime } from "../lib/admin-api"
import { AdminSidebar } from "../components/AdminSidebar"
import { useTranslation } from "@farmmitra/shared-utils/src/LanguageProvider"

type PaymentRecord = {
  id: string
  amount: number | string
  method: string
  status: string
  referenceNumber?: string | null
  receivedAt?: string | null
  order?: { id?: string; orderNumber?: string; totalAmount?: number | string; customerId?: string | null; masterOrder?: { customer?: { name?: string } | null } | null } | null
  vendor?: { name?: string } | null
  deliveryPartner?: { name?: string } | null
  receivedBy?: { name?: string } | null
}
type CashHandoverData = {
  partners: Array<{ id: string; name: string; cashCollected: number; cashHandedOver: number; availableCash: number }>
  handovers: Array<{
    id: string
    handoverNumber: string
    amount: number | string
    createdAt: string
    deliveryPartner: { name: string }
    receivedBy: { name: string }
    notes?: string | null
  }>
}

export default function PaymentsPage() {
  const { t } = useTranslation()
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [methodFilter, setMethodFilter] = useState("ALL")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [cashHandoverData, setCashHandoverData] = useState<CashHandoverData>({ partners: [], handovers: [] })
  const [selectedPartner, setSelectedPartner] = useState("")
  const [handoverAmount, setHandoverAmount] = useState("")
  const [handoverNotes, setHandoverNotes] = useState("")
  const [handoverMessage, setHandoverMessage] = useState("")
  const [handoverError, setHandoverError] = useState("")
  const [handoverBusy, setHandoverBusy] = useState(false)

  const loadPayments = async () => {
    setLoading(true)
    try {
      const [paymentResult, handoverResult] = await Promise.allSettled([
        fetchAdminJson<PaymentRecord[]>("/api/v1/marketplace/admin/payments"),
        fetchAdminJson<CashHandoverData>("/api/v1/marketplace/admin/cash-handovers"),
      ])
      if (paymentResult.status === "rejected") {
        throw paymentResult.reason
      }
      setPayments(paymentResult.value)
      if (handoverResult.status === "fulfilled") {
        setCashHandoverData(handoverResult.value)
      } else {
        setHandoverError(handoverResult.reason instanceof Error ? handoverResult.reason.message : "Unable to load cash handover balances.")
      }
    } catch (error) {
      setHandoverError(error instanceof Error ? error.message : "Unable to load payment records.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPayments()
  }, [])

  async function recordCashHandover(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHandoverError("")
    setHandoverMessage("")
    const amount = Number(handoverAmount)
    const partner = cashHandoverData.partners.find((item) => item.id === selectedPartner)
    if (!partner || !Number.isFinite(amount) || amount <= 0 || amount > partner.availableCash) {
      setHandoverError(t("amountMustFitCash"))
      return
    }
    setHandoverBusy(true)
    try {
      await fetchAdminJson("/api/v1/marketplace/admin/cash-handovers", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ deliveryPartnerId: selectedPartner, amount, notes: handoverNotes || undefined }),
      })
      setHandoverAmount("")
      setHandoverNotes("")
      setHandoverMessage(t("handoverSuccess"))
      await loadPayments()
    } catch (reason) {
      setHandoverError(reason instanceof Error ? reason.message : "Unable to record cash handover.")
    } finally {
      setHandoverBusy(false)
    }
  }

  const visiblePayments = useMemo(() => {
    const query = search.trim().toLowerCase()
    return payments.filter((payment) => {
      const matchesMethod = methodFilter === "ALL" || payment.method === methodFilter
      const matchesStatus = statusFilter === "ALL" || (statusFilter === "PENDING" ? ["PENDING"].includes(payment.status) : statusFilter === "COLLECTED" ? ["COMPLETED", "CASH_COLLECTED", "UPI_COLLECTED"].includes(payment.status) : payment.status === statusFilter)
      const haystack = [payment.id, payment.order?.orderNumber, payment.referenceNumber, payment.vendor?.name, payment.deliveryPartner?.name, payment.receivedBy?.name].filter(Boolean).join(" ").toLowerCase()
      return matchesMethod && matchesStatus && (!query || haystack.includes(query))
    })
  }, [methodFilter, payments, search, statusFilter])

  return (
    <main className="app-shell">
      <AdminSidebar />

      <section className="main-content">
        <header className="topbar">
          <div>
            <h1>{t("paymentHistory")}</h1>
            <p>{t("paymentHistoryDescription")}</p>
          </div>
        </header>

        <div className="content">
          <section className="panel">
            <div className="panel-header"><div><h2>{t("staffCashHandovers")}</h2><p>{t("handoverDescription")}</p></div></div>
            {handoverError && <div className="message error" role="alert">{handoverError}</div>}
            {handoverMessage && <div className="message success" role="status">{handoverMessage}</div>}
            <div className="table-wrap"><table><thead><tr><th>{t("deliveryPartner")}</th><th>{t("cashCollected")}</th><th>{t("cashHandedOver")}</th><th>{t("availableCash")}</th></tr></thead>
              <tbody>{cashHandoverData.partners.map((partner) => <tr key={partner.id}><td>{partner.name}</td><td>{formatCurrency(partner.cashCollected)}</td><td>{formatCurrency(partner.cashHandedOver)}</td><td>{formatCurrency(partner.availableCash)}</td></tr>)}
              {!cashHandoverData.partners.length && <tr><td colSpan={4}>{t("noActivePartners")}</td></tr>}</tbody>
            </table></div>
            <form className="vendor-filters" onSubmit={recordCashHandover}>
              <label>{t("deliveryPartner")}<select required value={selectedPartner} onChange={(event) => setSelectedPartner(event.target.value)}><option value="">{t("selectPartner")}</option>{cashHandoverData.partners.map((partner) => <option value={partner.id} key={partner.id}>{partner.name} · {formatCurrency(partner.availableCash)} {t("availableCash").toLowerCase()}</option>)}</select></label>
              <label>{t("handoverAmount")}<input required type="number" min="0.01" step="0.01" max={cashHandoverData.partners.find((partner) => partner.id === selectedPartner)?.availableCash ?? 0} value={handoverAmount} onChange={(event) => setHandoverAmount(event.target.value)} /></label>
              <label>{t("notes")}<input value={handoverNotes} onChange={(event) => setHandoverNotes(event.target.value)} maxLength={1000} /></label>
              <button type="submit" disabled={handoverBusy || !selectedPartner}>{handoverBusy ? t("recordingHandover") : t("recordHandover")}</button>
            </form>
            <h3>{t("recentHandovers")}</h3>
            {!cashHandoverData.handovers.length ? <div className="empty-state">{t("noHandovers")}</div> : <div className="table-wrap"><table><thead><tr><th>{t("handoverNumber")}</th><th>{t("date")} / {t("time")}</th><th>{t("deliveryPartner")}</th><th>{t("receivedBy")}</th><th>{t("amount")}</th><th>{t("notes")}</th></tr></thead>
              <tbody>{cashHandoverData.handovers.map((handover) => <tr key={handover.id}><td>{handover.handoverNumber}</td><td>{formatDateTime(handover.createdAt)}</td><td>{handover.deliveryPartner.name}</td><td>{handover.receivedBy.name}</td><td>{formatCurrency(handover.amount)}</td><td>{handover.notes || "—"}</td></tr>)}</tbody>
            </table></div>}
          </section>
          <section className="panel">
            <div className="vendor-filters">
              <label>
                {t("search")}
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("searchPaymentRecords")} />
              </label>
              <label>
                {t("method")}
                <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)}>
                  <option value="ALL">{t("all")}</option>
                  <option value="CASH">{t("cash")}</option>
                  <option value="UPI">{t("upi")}</option>
                </select>
              </label>
              <label>
                {t("status")}
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="ALL">{t("all")}</option>
                  <option value="PENDING">{t("pending")}</option>
                  <option value="COLLECTED">{t("collected")}</option>
                  <option value="COMPLETED">{t("completed")}</option>
                  <option value="CASH_COLLECTED">{t("cashCollectedStatus")}</option>
                  <option value="UPI_COLLECTED">{t("upiCollectedStatus")}</option>
                </select>
              </label>
            </div>

            {loading ? (
              <div className="empty-state">{t("loadingPayments")}</div>
            ) : visiblePayments.length === 0 ? (
              <div className="empty-state">{t("noPaymentsMatch")}</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("paymentId")}</th>
                      <th>{t("order")}</th>
                      <th>{t("customers")}</th>
                      <th>{t("business")}</th>
                      <th>{t("amount")}</th>
                      <th>{t("method")}</th>
                      <th>{t("reference")}</th>
                      <th>{t("status")}</th>
                      <th>{t("collectedBy")}</th>
                      <th>{t("received")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePayments.map((payment) => (
                      <tr key={payment.id}>
                        <td><strong>{payment.id.slice(0, 10)}</strong></td>
                        <td>{payment.order?.orderNumber || payment.order?.id || "—"}</td>
                        <td>{payment.order?.masterOrder?.customer?.name || payment.order?.customerId || "—"}</td>
                        <td>Rawat Farm</td>
                        <td><strong>{formatCurrency(payment.amount)}</strong></td>
                        <td>{payment.method}</td>
                        <td>{payment.referenceNumber || "—"}</td>
                        <td><span className={`status ${payment.status.toLowerCase()}`}>{payment.status === "CASH_COLLECTED" ? t("cashCollectedStatus") : payment.status === "UPI_COLLECTED" ? t("upiCollectedStatus") : payment.status === "PENDING" ? t("pending") : payment.status === "COMPLETED" ? t("completed") : payment.status.replaceAll("_", " ")}</span></td>
                        <td>{payment.deliveryPartner?.name || payment.receivedBy?.name || "—"}</td>
                        <td>{formatDateTime(payment.receivedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}
