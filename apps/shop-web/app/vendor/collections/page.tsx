"use client"

import { useEffect, useState } from "react"
import { PortalShell, StateMessage } from "../../components/PortalShell"
import { api } from "../../lib/api"

type Payment = { id: string; amount: string | number; method: string; status: string; referenceNumber?: string | null; receivedAt?: string | null; order?: { orderNumber: string } | null; deliveryPartner?: { name: string } | null }
type Collections = { payments: Payment[]; totals: { total: number; cash: number; upi: number } }
const links = [{ label: "Dashboard", href: "/vendor/dashboard" }, { label: "Products", href: "/vendor/products" }, { label: "Orders", href: "/vendor/orders" }, { label: "Delivery partners", href: "/vendor/delivery-partners" }, { label: "Delivery overview", href: "/vendor/delivery-dashboard" }, { label: "Collections", href: "/vendor/collections" }, { label: "Outstanding", href: "/vendor/outstanding" }]
const money = (value: number | string) => `₹${Number(value || 0).toLocaleString("en-IN")}`

export default function VendorCollections() {
  const [data, setData] = useState<Collections | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  useEffect(() => { api<{ vendor: { id: string } | null }>("/api/v1/marketplace/me").then((identity) => identity.vendor ? api<Collections>(`/api/v1/marketplace/vendors/${identity.vendor.id}/collections`) : Promise.reject(new Error("Vendor access is not configured"))).then(setData).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load collections")).finally(() => setLoading(false)) }, [])
  return <PortalShell title="Payment collections" subtitle="Cash and UPI collections belonging to this vendor." links={links}>{error && <StateMessage error>{error}<br /><button onClick={() => window.location.reload()}>Try again</button></StateMessage>}{loading ? <StateMessage>Loading collections...</StateMessage> : data && <><div className="portal-stats"><div className="portal-stat"><span>Total collected</span><strong>{money(data.totals.total)}</strong></div><div className="portal-stat"><span>Cash</span><strong>{money(data.totals.cash)}</strong></div><div className="portal-stat"><span>UPI</span><strong>{money(data.totals.upi)}</strong></div></div><section className="portal-panel">{data.payments.length === 0 ? <div className="portal-empty">No collections recorded.</div> : <table className="portal-table"><thead><tr><th>Date</th><th>Order</th><th>Partner</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead><tbody>{data.payments.map((payment) => <tr key={payment.id}><td>{payment.receivedAt ? new Date(payment.receivedAt).toLocaleString("en-IN") : "-"}</td><td>{payment.order?.orderNumber || "Order"}</td><td>{payment.deliveryPartner?.name || "-"}</td><td>{money(payment.amount)}</td><td>{payment.method}</td><td>{payment.referenceNumber || "-"}</td></tr>)}</tbody></table>}</section></>}</PortalShell>
}
