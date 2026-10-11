"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminSidebar } from "../components/AdminSidebar"
import { clearAdminSession, fetchAdminJson, formatCurrency } from "../lib/admin-api"

type Vendor = { id: string; name: string; isActive: boolean; status: string }
type Customer = { id: string; name: string; email?: string | null; mobile?: string | null; status?: string; roles?: string[] }
type PriceRow = {
  id: string
  name: string
  status: string
  vendorId: string
  unit: { code: string }
  basePrice: number | string | null
  customerPrice: number | string | null
  effectivePrice: number | string | null
  effectiveSource?: "BASE" | "CUSTOMER_OVERRIDE" | "AUTOMATIC_RULE"
  overrideId: string | null
}
type AutomaticRule = { vendorId: string; percentAdjustment: number | string; isActive: boolean; effectiveFrom: string }

export function PricingPage() {
  const router = useRouter()
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [vendorId, setVendorId] = useState("")
  const [customerId, setCustomerId] = useState("")
  const [customerSearch, setCustomerSearch] = useState("")
  const [rows, setRows] = useState<PriceRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [automaticRule, setAutomaticRule] = useState<AutomaticRule | null>(null)
  const [ruleDraft, setRuleDraft] = useState("0")
  const [ruleEnabled, setRuleEnabled] = useState(false)

  async function loadSelectors() {
    setLoading(true)
    setError("")
    try {
      const [vendorData, users] = await Promise.all([
        fetchAdminJson<Vendor[]>("/api/v1/marketplace/admin/vendors?status=APPROVED"),
        fetchAdminJson<Customer[]>("/api/v1/users"),
      ])
      const customerData = users.filter((user) => user.roles?.includes("CUSTOMER"))
      setVendors(vendorData)
      setCustomers(customerData)
      setVendorId(vendorData[0]?.id || "")
      setCustomerId(customerData[0]?.id || "")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load pricing options")
      if (reason instanceof Error && reason.message.includes("session")) {
        clearAdminSession()
        router.push("/")
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadAutomaticRule(selectedVendor: string) {
    try {
      const query = new URLSearchParams({ action: "automatic", vendorId: selectedVendor })
      const rule = await fetchAdminJson<AutomaticRule | null>(`/api/v1/marketplace/admin/pricing?${query}`)
      setAutomaticRule(rule)
      setRuleDraft(rule ? String(rule.percentAdjustment) : "0")
      setRuleEnabled(Boolean(rule?.isActive))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load automatic pricing rule")
    }
  }

  async function loadPrices(selectedVendor = vendorId, selectedCustomer = customerId) {
    if (!selectedVendor || !selectedCustomer) {
      setRows([])
      return
    }
    setLoading(true)
    setError("")
    try {
      const query = new URLSearchParams({ vendorId: selectedVendor, customerId: selectedCustomer })
      const result = await fetchAdminJson<PriceRow[]>(`/api/v1/marketplace/admin/pricing?${query}`)
      setRows(result)
      setDrafts(Object.fromEntries(result.flatMap((row) => [
        [`base:${row.id}`, row.basePrice == null ? "" : String(row.basePrice)],
        [`customer:${row.id}`, row.customerPrice == null ? "" : String(row.customerPrice)],
      ])))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load product prices")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadSelectors() }, [])
  useEffect(() => {
    if (vendorId) void loadAutomaticRule(vendorId)
    else setAutomaticRule(null)
    if (vendorId && customerId) void loadPrices(vendorId, customerId)
    else setRows([])
  }, [vendorId, customerId])

  const visibleCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase()
    return customers.filter((customer) => !query || [customer.name, customer.email, customer.mobile].filter(Boolean).join(" ").toLowerCase().includes(query))
  }, [customers, customerSearch])

  function parsePrice(value: string): number {
    const price = Number(value)
    if (!value.trim() || !Number.isFinite(price) || price < 0) throw new Error("Enter a finite non-negative price.")
    return price
  }

  async function saveBasePrice(row: PriceRow) {
    setSaving(true)
    setError("")
    setMessage("")
    try {
      await fetchAdminJson("/api/v1/marketplace/admin/pricing?action=base", {
        method: "PATCH",
        body: JSON.stringify({ vendorId, productId: row.id, price: parsePrice(drafts[`base:${row.id}`] || "") }),
      })
      setMessage(`Base rate saved for ${row.name}. Existing orders retain their saved prices.`)
      await loadPrices()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save base rate")
    } finally {
      setSaving(false)
    }
  }

  async function saveCustomerPrice(row: PriceRow) {
    setSaving(true)
    setError("")
    setMessage("")
    try {
      await fetchAdminJson("/api/v1/marketplace/admin/pricing/overrides", {
        method: "POST",
        body: JSON.stringify({ customerId, vendorId, productId: row.id, price: parsePrice(drafts[`customer:${row.id}`] || "") }),
      })
      setMessage(`Custom rate saved for ${row.name}.`)
      await loadPrices()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save customer rate")
    } finally {
      setSaving(false)
    }
  }

  async function removeCustomerPrice(row: PriceRow) {
    if (!row.overrideId) return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const query = new URLSearchParams({ vendorId, customerId, productId: row.id })
      await fetchAdminJson(`/api/v1/marketplace/admin/pricing/overrides/${encodeURIComponent(row.overrideId)}?${query}`, { method: "DELETE" })
      setMessage(`${row.name} now uses the shop base rate for this customer.`)
      await loadPrices()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to remove customer rate")
    } finally {
      setSaving(false)
    }
  }

  async function saveAutomaticRule() {
    const percentAdjustment = Number(ruleDraft)
    if (!ruleDraft.trim() || !Number.isFinite(percentAdjustment) || percentAdjustment < -100 || percentAdjustment > 1000) {
      setError("Enter an automatic adjustment from -100% to 1000%.")
      return
    }
    if (!vendorId) return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const rule = await fetchAdminJson<AutomaticRule>("/api/v1/marketplace/admin/pricing?action=automatic", {
        method: "PATCH",
        body: JSON.stringify({ vendorId, percentAdjustment, isActive: ruleEnabled }),
      })
      setAutomaticRule(rule)
      setMessage("Automatic pricing rule saved. It applies to customers created from now on; manual customer overrides take priority.")
      await loadPrices()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save automatic pricing rule")
    } finally {
      setSaving(false)
    }
  }

  return <main className="app-shell">
    <AdminSidebar />
    <section className="main-content">
      <header className="topbar"><div><h1>Shop pricing</h1><p>Manage product base rates and customer-specific rates.</p></div><button className="top-logout" onClick={() => { clearAdminSession(); router.push("/") }}>Logout</button></header>
      <div className="content">
        <section className="panel">
          <div className="panel-header"><div><h3>Price scope</h3><p>Custom rates apply only to the selected customer, shop, and product.</p></div></div>
          <div className="admin-form-grid">
            <label>Shop / vendor<select value={vendorId} onChange={(event) => setVendorId(event.target.value)}><option value="">Select a shop</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select></label>
            <label>Search customers<input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Name, email, or mobile" /></label>
            <label>Customer<select value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Select a customer</option>{visibleCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.status === "INACTIVE" ? " (inactive)" : ""}</option>)}</select></label>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header"><div><h3>Automatic pricing for new customers</h3><p>Adjust this shop's base rates for customers created after the rule is saved. Existing customers are unaffected; manual customer overrides always take priority.</p></div></div>
          <div className="admin-form-grid">
            <label><input type="checkbox" checked={ruleEnabled} onChange={(event) => setRuleEnabled(event.target.checked)} disabled={!vendorId} /> Enable automatic pricing</label>
            <label>Base-rate adjustment (%)<input type="number" min="-100" max="1000" step="0.01" value={ruleDraft} onChange={(event) => setRuleDraft(event.target.value)} disabled={!vendorId} /></label>
            <button type="button" disabled={saving || !vendorId} onClick={() => void saveAutomaticRule()}>{saving ? "Saving..." : "Save automatic rule"}</button>
          </div>
          {automaticRule?.effectiveFrom && <p className="muted">Current rule effective from {new Date(automaticRule.effectiveFrom).toLocaleString()}.</p>}
        </section>
        <section className="panel">
          <div className="panel-header"><div><h3>Product rates</h3><p>Base rate and effective customer rate are shown per product unit.</p></div></div>
          {error && <div className="message error" role="alert">{error}</div>}
          {message && <div className="message" role="status">{message}</div>}
          {loading ? <div className="empty-state">Loading prices...</div> : rows.length === 0 ? <div className="empty-state">Select a shop and customer to manage prices.</div> : <div className="table-wrap"><table>
            <thead><tr><th>Product</th><th>Unit</th><th>Current base rate</th><th>Edit base rate</th><th>Customer rate</th><th>Effective rate</th><th>Actions</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}>
              <td><strong>{row.name}</strong><small className="price-status">{row.status}</small></td>
              <td>{row.unit.code}</td>
              <td>{row.basePrice == null ? "No base rate" : `${formatCurrency(row.basePrice)} / ${row.unit.code}`}</td>
              <td><input type="number" min="0" step="0.01" aria-label={`Base rate for ${row.name}`} value={drafts[`base:${row.id}`] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [`base:${row.id}`]: event.target.value }))} /><button disabled={saving} onClick={() => void saveBasePrice(row)}>Save base</button></td>
              <td>{row.customerPrice != null ? `${formatCurrency(row.customerPrice)} / ${row.unit.code}` : row.effectiveSource === "AUTOMATIC_RULE" ? "Automatic rule" : "Using base rate"}</td>
              <td><strong>{row.effectivePrice == null ? "Unavailable" : `${formatCurrency(row.effectivePrice)} / ${row.unit.code}`}</strong><small className="price-status">{row.effectiveSource === "CUSTOMER_OVERRIDE" ? "Custom customer rate" : row.effectiveSource === "AUTOMATIC_RULE" ? "Automatic rule" : "Base rate"}</small></td>
              <td><div className="customer-access-actions"><input type="number" min="0" step="0.01" aria-label={`Customer rate for ${row.name}`} value={drafts[`customer:${row.id}`] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [`customer:${row.id}`]: event.target.value }))} /><button disabled={saving || !customerId} onClick={() => void saveCustomerPrice(row)}>{row.overrideId ? "Update override" : "Set override"}</button>{row.overrideId && <button disabled={saving} onClick={() => void removeCustomerPrice(row)}>Remove</button>}</div></td>
            </tr>)}</tbody>
          </table></div>}
        </section>
      </div>
    </section>
  </main>
}

export default PricingPage
