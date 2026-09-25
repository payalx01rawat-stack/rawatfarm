"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:4000"
type DeliveryPartner = { user: { id: string; name: string; email?: string | null; status: string }; vendor?: { name: string } | null; capabilities?: string[] | null }

export default function DeliveryPage() {
  const router = useRouter()
  const [partners, setPartners] = useState<DeliveryPartner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  useEffect(() => { const token = localStorage.getItem("farmmitra_access_token"); fetch(`${API_URL}/api/v1/marketplace/admin/delivery-partners`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data?.error || "Unable to load delivery partners"); setPartners(data) }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load delivery partners")).finally(() => setLoading(false)) }, [])

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo">FM</div>
          <div>
            <strong>FarmMitra</strong>
            <span>Admin Portal</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button className="nav-item" onClick={() => router.push("/dashboard")}>▦ Dashboard</button>
          <button className="nav-item" onClick={() => router.push("/orders")}>▤ Orders</button>
          <button className="nav-item" onClick={() => router.push("/shops")}>◉ Shops</button>
          <button className="nav-item" onClick={() => router.push("/products")}>□ Products</button>
          <button className="nav-item active">⌁ Delivery</button>
          <button className="nav-item" onClick={() => router.push("/reports")}>◫ Reports</button>
        </nav>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div>
            <h1>Delivery</h1>
            <p>Manage delivery staff and assignments.</p>
          </div>
        </header>

        <div className="content">
            <section className="panel">
            {error && <div className="empty-state">{error}</div>}{loading ? <div className="empty-state">Loading delivery partners...</div> : partners.length === 0 ? <div className="empty-state">No delivery partners found.</div> : <div className="table-wrap"><table><thead><tr><th>Partner</th><th>Vendor</th><th>Capabilities</th><th>Status</th></tr></thead><tbody>{partners.map((partner) => <tr key={`${partner.user.id}-${partner.vendor?.name || "global"}`}><td><strong>{partner.user.name}</strong><span>{partner.user.email || ""}</span></td><td>{partner.vendor?.name || "Unassigned"}</td><td>{partner.capabilities?.join(", ") || "DELIVERY"}</td><td>{partner.user.status}</td></tr>)}</tbody></table></div>}
          </section>
        </div>
      </section>
    </main>
  )
}
