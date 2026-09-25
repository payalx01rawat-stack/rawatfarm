"use client"

import { useEffect, useState } from "react"
import { PortalShell, StateMessage } from "../../components/PortalShell"
import { api } from "../../lib/api"

type Totals = { deliveries: number; pending: number; delivered: number; collected: number; cash: number; upi: number; outstanding: number; overdue: number }
type Partner = { userId: string; name: string; deliveries: number; collected: number; cash: number; upi: number }
type Dashboard = { totals: Totals; partners: Partner[] }
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`
const links = [{ label: "Dashboard", href: "/vendor/dashboard" }, { label: "Products", href: "/vendor/products" }, { label: "Orders", href: "/vendor/orders" }, { label: "Delivery partners", href: "/vendor/delivery-partners" }, { label: "Delivery overview", href: "/vendor/delivery-dashboard" }, { label: "Collections", href: "/vendor/collections" }, { label: "Outstanding", href: "/vendor/outstanding" }]

export default function VendorDeliveryDashboard() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [error, setError] = useState("")
  useEffect(() => { api<{ vendor: { id: string } | null }>("/api/v1/marketplace/me").then((identity) => identity.vendor ? api<Dashboard>(`/api/v1/marketplace/vendors/${identity.vendor.id}/delivery-dashboard`) : Promise.reject(new Error("Vendor access is not configured"))).then(setDashboard).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load delivery overview")) }, [])
  return <PortalShell title="Delivery overview" subtitle="Vendor-scoped delivery and collection performance." links={links}>{error && <StateMessage error>{error}</StateMessage>}{!dashboard && !error ? <StateMessage>Loading delivery overview...</StateMessage> : dashboard && <><div className="portal-stats">{[["Deliveries", dashboard.totals.deliveries], ["Pending", dashboard.totals.pending], ["Delivered", dashboard.totals.delivered], ["Collected", money(dashboard.totals.collected)], ["Outstanding", money(dashboard.totals.outstanding)]].map(([label, value]) => <div className="portal-stat" key={String(label)}><span>{label}</span><strong>{value}</strong><small>{label === "Outstanding" ? `${dashboard.totals.overdue} overdue` : "Vendor orders"}</small></div>)}</div><section className="portal-panel"><h2>Partner summary</h2>{dashboard.partners.length === 0 ? <div className="portal-empty">No partner activity yet.</div> : <table className="portal-table"><thead><tr><th>Partner</th><th>Deliveries</th><th>Collected</th><th>Cash</th><th>UPI</th></tr></thead><tbody>{dashboard.partners.map((partner) => <tr key={partner.userId}><td><strong>{partner.name}</strong></td><td>{partner.deliveries}</td><td>{money(partner.collected)}</td><td>{money(partner.cash)}</td><td>{money(partner.upi)}</td></tr>)}</tbody></table>}</section></>}</PortalShell>
}
