"use client"

import { useEffect, useState } from "react"
import { PortalShell, StateMessage } from "../../components/PortalShell"
import { api } from "../../lib/api"

type Outstanding = { id: string; orderNumber: string; totalAmount: string | number; status: string; paymentSummary: { orderTotal: number; collected: number; outstanding: number; daysOutstanding: number; overdue: boolean }; deliveries: { assignments: { user?: { name: string } }[] }[] }
const links = [{ label: "Dashboard", href: "/vendor/dashboard" }, { label: "Products", href: "/vendor/products" }, { label: "Orders", href: "/vendor/orders" }, { label: "Delivery partners", href: "/vendor/delivery-partners" }, { label: "Delivery overview", href: "/vendor/delivery-dashboard" }, { label: "Collections", href: "/vendor/collections" }, { label: "Outstanding", href: "/vendor/outstanding" }]
const money = (value: number | string) => `₹${Number(value || 0).toLocaleString("en-IN")}`

export default function VendorOutstanding() {
  const [orders, setOrders] = useState<Outstanding[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  useEffect(() => { api<{ vendor: { id: string } | null }>("/api/v1/marketplace/me").then((identity) => identity.vendor ? api<Outstanding[]>(`/api/v1/marketplace/vendors/${identity.vendor.id}/outstanding`) : Promise.reject(new Error("Vendor access is not configured"))).then(setOrders).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load outstanding balances")).finally(() => setLoading(false)) }, [])
  return <PortalShell title="Outstanding payments" subtitle="Balances calculated from the payment ledger." links={links}>{error && <StateMessage error>{error}<br /><button onClick={() => window.location.reload()}>Try again</button></StateMessage>}<section className="portal-panel">{loading ? <StateMessage>Loading outstanding balances...</StateMessage> : orders.length === 0 && !error ? <div className="portal-empty"><strong>No outstanding balances.</strong><br />All vendor orders are currently settled.</div> : orders.length > 0 && <div className="table-wrap"><table className="portal-table"><thead><tr><th>Order</th><th>Total</th><th>Collected</th><th>Outstanding</th><th>Age</th><th>Status</th><th>Partner</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.orderNumber}</strong></td><td>{money(order.paymentSummary.orderTotal)}</td><td>{money(order.paymentSummary.collected)}</td><td>{money(order.paymentSummary.outstanding)}</td><td>{order.paymentSummary.daysOutstanding} days</td><td><span className={`status-badge ${order.paymentSummary.overdue ? "warn" : ""}`}>{order.paymentSummary.overdue ? "OVERDUE" : "OUTSTANDING"}</span></td><td>{order.deliveries[0]?.assignments[0]?.user?.name || "Unassigned"}</td></tr>)}</tbody></table></div>}</section></PortalShell>
}
