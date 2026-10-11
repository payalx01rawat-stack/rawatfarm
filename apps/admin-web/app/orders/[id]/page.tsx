"use client"

import { use, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { fetchAdminJson, formatCurrency, formatDateTime, getAdminToken, normalizeStatusClass } from "../../lib/admin-api"
import { AdminSidebar } from "../../components/AdminSidebar"

type OrderRow = {
  id: string
  orderNumber: string
  status: string
  totalAmount: number | string
  orderDate?: string | null
  customerId?: string | null
  shop?: { id?: string; name?: string; ownerName?: string | null } | null
  vendorId?: string | null
  vendor?: { id?: string; name?: string } | null
  items?: Array<{ id?: string; productNameSnapshot?: string | null; variantNameSnapshot?: string | null; skuSnapshot?: string | null; unitSnapshot?: string | null; orderedQuantity?: number | string; unitPrice?: number | string; lineTotal?: number | string; notes?: string | null }>
  statusHistory?: Array<{ id?: string; previousStatus?: string | null; newStatus?: string; createdAt?: string | null; reason?: string | null }>
  masterOrder?: { customer?: { name?: string; mobile?: string | null; email?: string | null } | null } | null
  deliveries?: Array<{ id?: string; status?: string; deliveryAddress?: string; scheduledAt?: string | null; assignments?: Array<{ id?: string; userId?: string; status?: string; user?: { id?: string; name?: string; email?: string | null; mobile?: string | null } }> }>
  payments?: Array<{ id?: string; amount?: number | string; method?: string; status?: string; referenceNumber?: string | null; receivedAt?: string | null; receivedBy?: { name?: string } | null; deliveryPartner?: { name?: string } | null }>
  deliveryAddressSnapshot?: string | null
}

type DeliveryPartner = {
  user: { id: string; name: string; email?: string | null; mobile?: string | null; status?: string; roles?: Array<{ role?: { name?: string } }> }
  vendor?: { id?: string; name?: string } | null
  isActive?: boolean
  capabilities?: string[] | null
}

const ORDER_LIFECYCLE = ["PLACED", "CONFIRMED", "PICKING", "PACKED", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED"]
const isEligibleDeliveryPartner = (partner: DeliveryPartner) =>
  partner.isActive && partner.user.status === "ACTIVE" &&
  (partner.user.roles?.some(({ role }) => ["DELIVERY_PARTNER", "DELIVERY_STAFF"].includes(role?.name ?? "")) || partner.capabilities?.includes("DELIVERY"))

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const resolvedParams = use(params)
  const orderId = resolvedParams.id
  const [order, setOrder] = useState<OrderRow | null>(null)
  const [partners, setPartners] = useState<DeliveryPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [statusBusy, setStatusBusy] = useState(false)
  const [assignBusy, setAssignBusy] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedPartnerId, setSelectedPartnerId] = useState("")
  const [message, setMessage] = useState("")

  const loadData = async () => {
    const token = getAdminToken()
    if (!token) {
      router.push("/")
      return
    }

    setLoading(true)
    setError("")

    try {
      const [detail, orderList] = await Promise.all([
        fetchAdminJson<OrderRow>(`/api/v1/marketplace/orders/${orderId}`, {}, token),
        fetchAdminJson<{ items: OrderRow[] }>(`/api/v1/orders?page=1&pageSize=200`, {}, token),
      ])

      const sourceOrder = orderList.items.find((candidate: OrderRow) => candidate.id === orderId) ?? null
      const merged = {
        ...detail,
        vendor: detail.vendor ? { ...detail.vendor, name: "Rawat Farm" } : null,
        shop: sourceOrder?.shop ? { ...sourceOrder.shop, name: "Rawat Farm", ownerName: null } : detail.shop ? { ...detail.shop, name: "Rawat Farm", ownerName: null } : null,
        items: detail.items?.length ? detail.items : sourceOrder?.items ?? [],
        statusHistory: sourceOrder?.statusHistory?.length ? sourceOrder.statusHistory : detail.statusHistory ?? [],
        deliveries: detail.deliveries ?? sourceOrder?.deliveries ?? [],
        payments: detail.payments ?? sourceOrder?.payments ?? [],
      }

      setOrder(merged)

      const partnerList = await fetchAdminJson<DeliveryPartner[]>("/api/v1/marketplace/admin/delivery-partners", {}, token)
      setPartners(partnerList)
      const currentVendorId = detail.vendorId ?? detail.vendor?.id ?? sourceOrder?.vendorId
      if (currentVendorId) {
        const available = partnerList.filter((partner: DeliveryPartner) =>
          isEligibleDeliveryPartner(partner) && (partner.vendor?.id === currentVendorId || partner.vendor?.name === detail.vendor?.name),
        )
        const firstPartner = available[0]
        if (firstPartner && !selectedPartnerId) {
          setSelectedPartnerId(firstPartner.user.id)
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load order details")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [orderId])

  const paymentSummary = useMemo(() => {
    const orderTotal = Number(order?.totalAmount ?? 0)
    const collected = (order?.payments ?? []).filter((payment) => ["COMPLETED", "CASH_COLLECTED", "UPI_COLLECTED"].includes(payment.status || "")).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
    const outstanding = Math.max(0, orderTotal - collected)
    return { orderTotal, collected, outstanding }
  }, [order])

  const eligiblePartners = useMemo(() => {
    if (!order) {
      return []
    }

    const vendorId = order.vendorId ?? order.vendor?.id
    return partners.filter((partner) => {
      if (!isEligibleDeliveryPartner(partner)) return false
      if (!vendorId) return true
      const target = partner.vendor?.id ?? partner.vendor?.name
      return target === vendorId || target === order.vendor?.name
    })
  }, [order, partners])

  const updateStatus = async (status: string) => {
    if (!order) return
    setStatusBusy(true)
    setError("")

    try {
      await fetchAdminJson(`/api/v1/marketplace/orders/${order.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      })
      setMessage(`Order status updated to ${status}.`)
      await loadData()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update status")
    } finally {
      setStatusBusy(false)
    }
  }

  const assignDelivery = async () => {
    if (!order || !selectedPartnerId) {
      setError("Select a delivery partner to assign.")
      return
    }

    setAssignBusy(true)
    setError("")

    try {
      await fetchAdminJson(`/api/v1/marketplace/orders/${order.id}/assignment`, {
        method: "POST",
        body: JSON.stringify({ userId: selectedPartnerId }),
      })
      setMessage("Delivery partner assigned successfully.")
      setShowAssignModal(false)
      await loadData()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to assign delivery partner")
    } finally {
      setAssignBusy(false)
    }
  }

  if (loading) {
    return <main className="app-shell"><section className="main-content"><div className="detail-loading">Loading order details...</div></section></main>
  }

  if (!order) {
    return <main className="app-shell"><section className="main-content"><div className="detail-loading">Order not found.<button onClick={() => router.push("/orders")}>Back to orders</button></div></section></main>
  }

  return (
    <main className="app-shell">
      <AdminSidebar />

      <section className="main-content">
        <header className="topbar">
          <div>
            <h1>Order details</h1>
            <p>{order.orderNumber}</p>
          </div>
          <button className="top-logout" onClick={() => router.push("/orders")}>Back to orders</button>
        </header>

        <div className="content">
          <button className="back-button" onClick={() => router.push("/orders")}>← Back to orders</button>

          {message && <div className="success-message">{message}</div>}
          {error && <div className="message error">{error}</div>}

          <div className="detail-title">
            <h1>{order.orderNumber}</h1>
            <span className={`status ${normalizeStatusClass(order.status)}`}>{order.status.replaceAll("_", " ")}</span>
          </div>

          <div className="row-actions" style={{ margin: "18px 0" }}>
            {order.status === "PLACED" && <button className="primary-action" disabled={statusBusy} onClick={() => void updateStatus("CONFIRMED")}>{statusBusy ? "Updating..." : "Confirm order"}</button>}
            {order.status === "CONFIRMED" && <button className="primary-action" disabled={statusBusy} onClick={() => void updateStatus("PICKING")}>{statusBusy ? "Updating..." : "Move to picking"}</button>}
            {order.status === "PICKING" && <button className="primary-action" disabled={statusBusy} onClick={() => void updateStatus("PACKED")}>{statusBusy ? "Updating..." : "Mark packed"}</button>}
            {order.status === "PACKED" && <button className="primary-action" onClick={() => setShowAssignModal(true)}>Assign Delivery Guy</button>}
            {order.status === "ASSIGNED" && <button className="secondary-action" onClick={() => setShowAssignModal(true)}>Reassign Delivery Guy</button>}
          </div>

          <div className="detail-grid">
            <section className="panel">
              <div className="panel-header"><h3>Customer</h3></div>
              <div className="info-list">
                <div><span>Name</span><strong>{order.masterOrder?.customer?.name || "Customer details unavailable"}</strong></div>
                <div><span>Contact</span><strong>{order.masterOrder?.customer?.mobile || order.masterOrder?.customer?.email || "—"}</strong></div>
                <div><span>Customer ID</span><strong>{order.customerId || "—"}</strong></div>
                <div><span>Delivery address</span><strong>{order.deliveryAddressSnapshot || "—"}</strong></div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header"><h3>Business</h3></div>
              <div className="info-list">
                <div><span>Business</span><strong>Rawat Farm</strong></div>
                <div><span>Shop</span><strong>Rawat Farm</strong></div>
                <div><span>Order date</span><strong>{formatDateTime(order.orderDate)}</strong></div>
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="panel-header"><h3>Items</h3></div>
            <div className="info-list">
              {(order.items ?? []).map((item, index) => (
                <div key={`${item.id ?? index}`}>
                  <span>{item.productNameSnapshot || "Product"}</span>
                  <strong>
                    {item.orderedQuantity ?? 0} × {formatCurrency(item.unitPrice ?? 0)} = {formatCurrency(item.lineTotal ?? 0)}
                  </strong>
                </div>
              ))}
            </div>
          </section>

          <div className="detail-grid">
            <section className="panel">
              <div className="panel-header"><h3>Payment summary</h3></div>
              <div className="summary-list">
                <div><span>Order total</span><strong>{formatCurrency(paymentSummary.orderTotal)}</strong></div>
                <div><span>Collected</span><strong>{formatCurrency(paymentSummary.collected)}</strong></div>
                <div><span>Outstanding</span><strong>{formatCurrency(paymentSummary.outstanding)}</strong></div>
                <div className="summary-total"><span>Status</span><strong>{paymentSummary.outstanding > 0 ? "PAYMENT_PENDING" : "PAID"}</strong></div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header"><h3>Delivery status</h3></div>
              <div className="info-list">
                <div><span>Assigned partner</span><strong>{order.deliveries?.[0]?.assignments?.[0]?.user?.name || "Not assigned"}</strong></div>
                <div><span>Delivery status</span><strong>{order.deliveries?.[0]?.status || "PENDING"}</strong></div>
                <div><span>Schedule</span><strong>{formatDateTime(order.deliveries?.[0]?.scheduledAt)}</strong></div>
              </div>
            </section>
          </div>

          <section className="panel">
            <div className="panel-header"><h3>Payment history</h3></div>
            <div className="info-list">
              {(order.payments ?? []).length === 0 ? (
                <div><span>No payments recorded</span><strong>—</strong></div>
              ) : (
                (order.payments ?? []).map((payment) => (
                  <div key={payment.id}>
                    <span>{payment.method} · {payment.status}</span>
                    <strong>
                      {formatCurrency(payment.amount ?? 0)}
                      <small style={{ display: "block", marginTop: 4, color: "#7b857f" }}>
                        {payment.referenceNumber ? `Ref: ${payment.referenceNumber}` : ""}
                        {payment.receivedAt ? ` · ${formatDateTime(payment.receivedAt)}` : ""}
                        {(payment.deliveryPartner?.name || payment.receivedBy?.name) ? ` · Collected by ${payment.deliveryPartner?.name || payment.receivedBy?.name}` : ""}
                      </small>
                    </strong>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header"><h3>Order lifecycle</h3></div>
            <div className="timeline">
              {ORDER_LIFECYCLE.map((step, index) => {
                const timestampEntry = (order.statusHistory ?? []).find((entry) => entry.newStatus === step)
                return (
                  <div className="timeline-item" key={step}>
                    <div className="timeline-dot" />
                    <div className="timeline-content">
                      <div className="timeline-top">
                        <strong>{step.replaceAll("_", " ")}</strong>
                        <span>{order.status === step ? "Current" : timestampEntry ? "Recorded" : "Pending"}</span>
                      </div>
                      {timestampEntry ? <p>{timestampEntry.reason || "State updated"}</p> : <p>Awaiting status update</p>}
                      {timestampEntry && <small>{formatDateTime(timestampEntry.createdAt)}</small>}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </section>

      {showAssignModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(23, 32, 28, 0.36)", display: "grid", placeItems: "center", padding: 16 }}>
          <div className="panel" style={{ width: "min(520px, 100%)", maxHeight: "80vh", overflow: "auto" }}>
            <div className="panel-header">
              <div>
                <h3>Assign Delivery Guy</h3>
                <p>Only active Rawat Farm Delivery Guys are shown.</p>
              </div>
              <button className="secondary-action" onClick={() => setShowAssignModal(false)}>Close</button>
            </div>

            <div className="vendor-form">
              <label>
                Delivery Guy
                <select value={selectedPartnerId} onChange={(event) => setSelectedPartnerId(event.target.value)}>
                  <option value="">Select a partner</option>
                  {eligiblePartners.map((partner) => (
                    <option key={partner.user.id} value={partner.user.id}>
                      {partner.user.name}
                    </option>
                  ))}
                </select>
              </label>
              {eligiblePartners.length === 0 && <p>No active Rawat Farm Delivery Guys are available.</p>}

              <button className="primary-action" style={{ marginTop: 16 }} disabled={assignBusy || !selectedPartnerId} onClick={() => void assignDelivery()}>
                {assignBusy ? "Assigning..." : "Assign Delivery Guy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
