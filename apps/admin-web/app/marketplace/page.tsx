"use client"

import { FormEvent, useEffect, useState } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:4000"
type Setup = { complete: boolean; checks: Record<string, boolean> }
type Vendor = { id: string; name: string; status: "PENDING" | "APPROVED" | "SUSPENDED"; contactEmail?: string | null; contactPhone?: string | null; address?: string | null; createdAt: string; _count: { products: number; orders: number; users: number }; setup: Setup }
type FormState = { businessName: string; ownerName: string; email: string; phone: string; address: string; password: string }
const emptyForm: FormState = { businessName: "", ownerName: "", email: "", phone: "", address: "", password: "" }

async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${API_URL}${path}`, { ...options, headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("farmmitra_access_token")}`, ...(options.headers || {}) } })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || "Request failed")
  return data
}

export default function MarketplaceAdmin() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [form, setForm] = useState<FormState>(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Vendor | null>(null)

  async function load() {
    setLoading(true); setError("")
    try {
      const query = new URLSearchParams(); if (search.trim()) query.set("search", search.trim()); if (status) query.set("status", status)
      setVendors(await request(`/api/v1/marketplace/admin/vendors${query.size ? `?${query}` : ""}`))
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load vendors") } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [status])

  async function createVendor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("")
    try { await request("/api/v1/marketplace/admin/vendors", { method: "POST", body: JSON.stringify(form) }); setForm(emptyForm); setShowForm(false); setMessage("Vendor created as pending. Review its setup before approval."); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create vendor") } finally { setSaving(false) }
  }
  async function updateStatus(vendor: Vendor, nextStatus: "APPROVED" | "SUSPENDED") {
    setError(""); setMessage("")
    try { await request(`/api/v1/marketplace/admin/vendors/${vendor.id}/status`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) }); setMessage(`${vendor.name} is now ${nextStatus.toLowerCase()}.`); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update vendor status") }
  }
  async function openDetails(vendor: Vendor) { try { setSelected(await request(`/api/v1/marketplace/admin/vendors/${vendor.id}`)) } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load vendor details") } }

  return <main className="app-shell"><aside className="sidebar"><div className="sidebar-brand"><div className="logo">FM</div><div><strong>FarmMitra</strong><span>Super Admin</span></div></div><nav className="sidebar-nav"><a className="nav-item active" href="/marketplace">Marketplace</a><a className="nav-item" href="/dashboard">Dashboard</a><a className="nav-item" href="/orders">Legacy orders</a></nav></aside><section className="main-content"><header className="topbar"><div><h1>Marketplace oversight</h1><p>Manage vendors and review marketplace activity.</p></div></header><div className="content"><div className="page-intro"><h2>Vendors</h2><p>Review onboarding, approval, and operational ownership.</p></div><section className="panel vendor-management"><div className="panel-header"><div><h2>Vendor accounts</h2><p>{vendors.length} matching vendor accounts</p></div><button className="primary-action" onClick={() => setShowForm((current) => !current)}>{showForm ? "Close form" : "Create vendor"}</button></div><div className="vendor-filters"><label>Search<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Business, email, or phone" /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="SUSPENDED">Suspended</option></select></label><button className="secondary-action" onClick={load}>Search</button></div>{showForm && <form className="vendor-form" onSubmit={createVendor}><h3>Create vendor account</h3><p>The password is hashed and never returned after creation.</p><div className="form-grid"><label>Business name<input required value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} /></label><label>Owner name<input required value={form.ownerName} onChange={(event) => setForm({ ...form, ownerName: event.target.value })} /></label><label>Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Phone<input required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label className="wide-field">Address<input required value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label><label>Password<input required type="password" minLength={8} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label></div><button className="primary-action" disabled={saving}>{saving ? "Creating..." : "Create pending vendor"}</button></form>}{message && <div className="success-message" role="status">{message}</div>}{error && <div className="empty-state" role="alert">{error}<br /><button onClick={load}>Try again</button></div>}{loading ? <div className="empty-state" role="status">Loading vendors...</div> : vendors.length === 0 ? <div className="empty-state">No vendors match this filter.</div> : <div className="table-wrap"><table><thead><tr><th>Business</th><th>Contact</th><th>Status</th><th>Setup</th><th>Created</th><th>Actions</th></tr></thead><tbody>{vendors.map((vendor) => <tr key={vendor.id}><td><button className="table-link" onClick={() => openDetails(vendor)}>{vendor.name}</button><small>{vendor._count.products} products · {vendor._count.orders} orders</small></td><td>{vendor.contactEmail || vendor.contactPhone || "Not configured"}</td><td><span className={`status-pill ${vendor.status.toLowerCase()}`}>{vendor.status}</span></td><td>{vendor.setup.complete ? "Complete" : "Incomplete"}</td><td>{new Date(vendor.createdAt).toLocaleDateString("en-IN")}</td><td><div className="row-actions"><button className="secondary-action" onClick={() => openDetails(vendor)}>Details</button>{vendor.status === "PENDING" || vendor.status === "SUSPENDED" ? <button className="primary-action" onClick={() => updateStatus(vendor, "APPROVED")}>Approve</button> : <button className="danger-action" onClick={() => updateStatus(vendor, "SUSPENDED")}>Suspend</button>}</div></td></tr>)}</tbody></table></div>}</section>{selected && <section className="panel vendor-detail"><div className="panel-header"><div><h2>{selected.name}</h2><p>{selected.contactEmail || "No email"} · {selected.contactPhone || "No phone"}</p></div><button className="secondary-action" onClick={() => setSelected(null)}>Close</button></div><div className="detail-grid"><div><strong>Status</strong><span>{selected.status}</span></div><div><strong>Setup</strong><span>{selected.setup.complete ? "Complete" : "Incomplete"}</span></div><div><strong>Products</strong><span>{selected._count.products}</span></div><div><strong>Orders</strong><span>{selected._count.orders}</span></div><div><strong>Delivery partners</strong><span>{selected._count.users}</span></div><div><strong>Address</strong><span>{selected.address || "Not configured"}</span></div></div></section>}</div></section></main>
}