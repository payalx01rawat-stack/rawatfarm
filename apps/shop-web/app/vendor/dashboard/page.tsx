"use client"

import { useEffect, useState } from "react"
import { PortalShell, StateMessage } from "../../components/PortalShell"
import { api } from "../../lib/api"

type Order = { id: string; orderNumber: string; status: string; totalAmount: string | number; payments: { status: string }[] }
type Identity = { vendor: { id: string; name: string } | null }

export default function VendorDashboard() {
  const [orders, setOrders] = useState<Order[]>([])
  const [vendor, setVendor] = useState<Identity["vendor"]>(null)
  const [error, setError] = useState("")
  useEffect(() => { (async () => { try { const identity = await api<Identity>("/api/v1/marketplace/me"); setVendor(identity.vendor); if (identity.vendor) setOrders(await api<Order[]>(`/api/v1/marketplace/vendors/${identity.vendor.id}/orders`)) } catch (e) { setError(e instanceof Error ? e.message : "Unable to load dashboard") } })() }, [])
  const today = new Date().toDateString()
  const stats = [
    ["Today's Orders", orders.filter((order) => new Date().toDateString() === today).length],
    ["Pending Orders", orders.filter((order) => !["DELIVERED", "CANCELLED"].includes(order.status)).length],
    ["Out for Delivery", orders.filter((order) => order.status === "OUT_FOR_DELIVERY").length],
    ["Delivered", orders.filter((order) => order.status === "DELIVERED").length],
    ["Payment Pending", orders.filter((order) => !order.payments.some((payment) => payment.status === "COMPLETED")).length],
  ]
  const revenue = orders.reduce((sum, order) => sum + Number(order.totalAmount), 0)
  return <PortalShell title={vendor?.name || "Vendor dashboard"} subtitle="Your vendor operations at a glance." links={[{ label: "Dashboard", href: "/vendor/dashboard" }, { label: "Products", href: "/vendor/products" }, { label: "Orders", href: "/vendor/orders" }, { label: "Delivery partners", href: "/vendor/delivery-partners" }, { label: "Payments", href: "/vendor/payments" }]}>{error && <StateMessage error>{error}</StateMessage>}<div className="portal-stats">{stats.map(([label, value]) => <div className="portal-stat" key={label as string}><span>{label}</span><strong>{value}</strong><small>Live from vendor orders</small></div>)}<div className="portal-stat"><span>Revenue</span><strong>₹{revenue.toLocaleString("en-IN")}</strong><small>All vendor orders</small></div></div><section className="portal-panel"><h2>Recent orders</h2>{orders.length === 0 ? <div className="portal-empty">No vendor orders yet.</div> : <table className="portal-table"><thead><tr><th>Order</th><th>Status</th><th>Amount</th><th>Payment</th></tr></thead><tbody>{orders.slice(0, 8).map((order) => <tr key={order.id}><td><strong>{order.orderNumber}</strong></td><td><span className="status-badge">{order.status.replaceAll("_", " ")}</span></td><td>₹{Number(order.totalAmount).toLocaleString("en-IN")}</td><td>{order.payments.some((payment) => payment.status === "COMPLETED") ? "Collected" : "Pending"}</td></tr>)}</tbody></table>}</section></PortalShell>
}
