"use client"

import { useEffect, useState } from "react"
import { PortalShell, StateMessage } from "../../components/PortalShell"
import { api } from "../../lib/api"
import { isPaymentCollected } from "../../lib/payment"

type Order = { id: string; orderNumber: string; status: string; totalAmount: string | number; createdAt?: string; items: { productNameSnapshot: string | null; orderedQuantity: string | number }[]; payments: { status: string }[]; deliveries: { assignments: { user?: { name: string } }[] }[] }
type Partner = { userId: string; user: { name: string } }
type Identity = { vendor: { id: string } | null }
const links = [{ label: "Dashboard", href: "/vendor/dashboard" }, { label: "Products", href: "/vendor/products" }, { label: "Orders", href: "/vendor/orders" }]
const money = (value: number | string) => `₹${Number(value || 0).toLocaleString("en-IN")}`

export default function VendorOrders() {
  const [vendorId, setVendorId] = useState("")
  const [orders, setOrders] = useState<Order[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function load() {
    setLoading(true)
    setError("")
    try {
      const identity = await api<Identity>("/api/v1/marketplace/me")
      if (!identity.vendor) throw new Error("Vendor access is not configured")
      setVendorId(identity.vendor.id)
      const [nextOrders, nextPartners] = await Promise.all([api<Order[]>(`/api/v1/marketplace/vendors/${identity.vendor.id}/orders`), api<Partner[]>(`/api/v1/marketplace/vendors/${identity.vendor.id}/delivery-partners`)])
      setOrders(nextOrders)
      setPartners(nextPartners)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load orders")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function updateStatus(id: string, status: string) {
    setError("")
    try { await api(`/api/v1/marketplace/orders/${id}/status`, { method: "POST", body: JSON.stringify({ status }) }); setMessage(`Order moved to ${status.replaceAll("_", " ")}`); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update order") }
  }

  async function assign(id: string) {
    setError("")
    try { await api(`/api/v1/marketplace/orders/${id}/assignment`, { method: "POST", body: JSON.stringify({ userId: selected[id] }) }); setMessage("Delivery partner assigned"); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to assign delivery") }
  }

  return <PortalShell title="Vendor orders" subtitle="Process only orders belonging to your vendor. Order and payment status stay separate." links={links}>
    {message && <StateMessage>{message}</StateMessage>}
    {error && <StateMessage error>{error}<br /><button onClick={load}>Try again</button></StateMessage>}
    {loading ? <section className="portal-panel dashboard-loading"><StateMessage>Loading vendor orders...</StateMessage></section> : !error && <section className="portal-panel"><div className="panel-caption"><strong>{orders.length} orders</strong><span>Lifecycle actions appear only when valid.</span></div>{orders.length === 0 ? <div className="portal-empty"><strong>No vendor orders found.</strong><br />Customer orders for this vendor will appear here.</div> : <div className="table-wrap"><table className="portal-table"><thead><tr><th>Order</th><th>Items</th><th>Amount</th><th>Order status</th><th>Payment status</th><th>Delivery partner</th><th>Actions</th></tr></thead><tbody>{orders.map((order) => { const collected = order.payments.some((payment) => isPaymentCollected(payment.status)); return <tr key={order.id}><td><strong>{order.orderNumber}</strong><small>{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "Date unavailable"}</small></td><td>{order.items.map((item) => `${item.productNameSnapshot || "Product"} × ${item.orderedQuantity}`).join(", ")}</td><td>{money(order.totalAmount)}</td><td><span className="status-badge">{order.status.replaceAll("_", " ")}</span></td><td><span className={`status-badge ${collected ? "" : "warn"}`}>{collected ? "Collected" : "Payment pending"}</span></td><td>{order.deliveries[0]?.assignments[0]?.user?.name || "Unassigned"}</td><td><div className="portal-actions">{order.status === "PLACED" && <button onClick={() => updateStatus(order.id, "CONFIRMED")}>Confirm</button>}{order.status === "CONFIRMED" && <button onClick={() => updateStatus(order.id, "PICKING")}>Start packing</button>}{order.status === "PICKING" && <button onClick={() => updateStatus(order.id, "PACKED")}>Mark packed</button>}{order.status === "PACKED" && <><select value={selected[order.id] || ""} onChange={(event) => setSelected({ ...selected, [order.id]: event.target.value })} aria-label={`Delivery partner for ${order.orderNumber}`}><option value="">Partner</option>{partners.filter((partner) => partner.user).map((partner) => <option key={partner.userId} value={partner.userId}>{partner.user.name}</option>)}</select><button className="primary" disabled={!selected[order.id]} onClick={() => assign(order.id)}>Assign</button></>}</div></td></tr>})}</tbody></table></div>}</section>}
  </PortalShell>
}
