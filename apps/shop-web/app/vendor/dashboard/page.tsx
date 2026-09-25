"use client"

import { useEffect, useState } from "react"
import { PortalShell, StateMessage } from "../../components/PortalShell"
import { api } from "../../lib/api"
import { isPaymentCollected } from "../../lib/payment"

type Order = { id: string; orderNumber: string; status: string; totalAmount: string | number; createdAt?: string; payments: { status: string }[] }
type Identity = { vendor: { id: string; name: string } | null }
type DeliverySummary = { totals: { collected: number; outstanding: number; overdue: number } }

const links = [{ label: "Dashboard", href: "/vendor/dashboard" }, { label: "Products", href: "/vendor/products" }, { label: "Orders", href: "/vendor/orders" }, { label: "Delivery", href: "/vendor/delivery-dashboard" }, { label: "Collections", href: "/vendor/collections" }, { label: "Outstanding", href: "/vendor/outstanding" }, { label: "Settings", href: "/vendor/settings" }]
const money = (value: number | string) => `₹${Number(value || 0).toLocaleString("en-IN")}`

export default function VendorDashboard() {
  const [orders, setOrders] = useState<Order[]>([])
  const [vendor, setVendor] = useState<Identity["vendor"]>(null)
  const [summary, setSummary] = useState<DeliverySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  async function load() {
    setLoading(true)
    setError("")
    try {
      const identity = await api<Identity>("/api/v1/marketplace/me")
      if (!identity.vendor) throw new Error("Vendor access is not configured")
      setVendor(identity.vendor)
      const [nextOrders, nextSummary] = await Promise.all([
        api<Order[]>(`/api/v1/marketplace/vendors/${identity.vendor.id}/orders`),
        api<DeliverySummary>(`/api/v1/marketplace/vendors/${identity.vendor.id}/delivery-dashboard`),
      ])
      setOrders(nextOrders)
      setSummary(nextSummary)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load dashboard")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const today = new Date().toDateString()
  const todayOrders = orders.filter((order) => order.createdAt && new Date(order.createdAt).toDateString() === today).length
  const pendingOrders = orders.filter((order) => !["DELIVERED", "CANCELLED"].includes(order.status)).length
  const activeOrders = orders.filter((order) => ["CONFIRMED", "PICKING", "PACKED", "ASSIGNED", "OUT_FOR_DELIVERY"].includes(order.status)).length
  const deliveredOrders = orders.filter((order) => order.status === "DELIVERED").length
  const sales = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)

  return <PortalShell title={vendor?.name || "Vendor dashboard"} subtitle="A live view of your orders, collections, and delivery activity." links={links}>
    {error && <StateMessage error>{error}<br /><button onClick={load}>Try again</button></StateMessage>}
    {loading ? <section className="portal-panel dashboard-loading" aria-label="Loading vendor dashboard"><StateMessage>Loading your vendor activity...</StateMessage></section> : !error && <><div className="portal-stats vendor-stats"><div className="portal-stat"><span>Today's orders</span><strong>{todayOrders}</strong><small>Orders created today</small></div><div className="portal-stat"><span>Total orders</span><strong>{orders.length}</strong><small>All vendor orders</small></div><div className="portal-stat"><span>Active orders</span><strong>{activeOrders}</strong><small>In fulfilment</small></div><div className="portal-stat"><span>Delivered</span><strong>{deliveredOrders}</strong><small>{pendingOrders} still pending</small></div><div className="portal-stat"><span>Order value</span><strong>{money(sales)}</strong><small>Across vendor orders</small></div><div className="portal-stat"><span>Collections</span><strong>{money(summary?.totals.collected || 0)}</strong><small>Cash and UPI recorded</small></div><div className="portal-stat"><span>Outstanding</span><strong>{money(summary?.totals.outstanding || 0)}</strong><small>{summary?.totals.overdue || 0} overdue</small></div></div><section className="portal-panel"><div className="section-heading"><div><p className="market-kicker">OPERATIONS</p><h2>Recent orders</h2></div><button className="clear-filters" onClick={() => window.location.assign("/vendor/orders")}>View all</button></div>{orders.length === 0 ? <div className="portal-empty"><strong>No vendor orders yet.</strong><br />New orders will appear here when customers check out.</div> : <div className="table-wrap"><table className="portal-table"><thead><tr><th>Order</th><th>Status</th><th>Amount</th><th>Payment</th></tr></thead><tbody>{orders.slice(0, 8).map((order) => <tr key={order.id}><td><strong>{order.orderNumber}</strong><small>{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "Date unavailable"}</small></td><td><span className="status-badge">{order.status.replaceAll("_", " ")}</span></td><td>{money(order.totalAmount)}</td><td><span className={`status-badge ${order.payments.some((payment) => isPaymentCollected(payment.status)) ? "" : "warn"}`}>{order.payments.some((payment) => isPaymentCollected(payment.status)) ? "Collected" : "Payment pending"}</span></td></tr>)}</tbody></table></div>}</section></>}
  </PortalShell>
}
