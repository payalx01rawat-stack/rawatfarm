"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminSidebar } from "../components/AdminSidebar"
import { clearAdminSession, fetchAdminJson } from "../lib/admin-api"

type VendorScope = { id: string; name: string; status?: string; isActive?: boolean }
type PaymentSettings = { id: string; name: string; upiId?: string | null; upiAccountLast4?: string | null; paymentDisplayName?: string | null; cashCollectionEnabled?: boolean; upiCollectionEnabled?: boolean }

const isValidUpiId = (value: string) => /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}@[A-Za-z][A-Za-z0-9.-]{1,63}$/.test(value.trim())

export default function SettingsPage() {
  const router = useRouter()
  const [scopeIds, setScopeIds] = useState<string[]>([])
  const [upiId, setUpiId] = useState("")
  const [upiAccountLast4, setUpiAccountLast4] = useState("")
  const [cashEnabled, setCashEnabled] = useState(true)
  const [upiEnabled, setUpiEnabled] = useState(false)
  const [configurationConflict, setConfigurationConflict] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  async function loadSettings() {
    setLoading(true)
    setError("")
    try {
      const scopes = (await fetchAdminJson<VendorScope[]>("/api/v1/marketplace/admin/vendors"))
        .filter((vendor) => vendor.name === "Rawat Farm" && vendor.isActive && vendor.status === "APPROVED")
      if (scopes.length !== 1) throw new Error("Exactly one active approved Rawat Farm vendor is required.")
      const records = await Promise.all(scopes.map((vendor) => fetchAdminJson<PaymentSettings>(`/api/v1/marketplace/vendors/${vendor.id}/payment-settings`)))
      const configuredIds = Array.from(new Set(records.map((record) => record.upiId?.trim()).filter((id): id is string => Boolean(id))))
      const hasUnconfiguredRecord = records.some((record) => !record.upiId?.trim())
      const conflict = configuredIds.length > 1 || (configuredIds.length > 0 && hasUnconfiguredRecord)
      setConfigurationConflict(conflict)
      setUpiId(configuredIds.length === 1 && !hasUnconfiguredRecord ? configuredIds[0] ?? "" : "")
      setUpiAccountLast4(records[0]?.upiAccountLast4 ?? "")
      setCashEnabled(records.length > 0 && records.every((record) => record.cashCollectionEnabled !== false))
      setUpiEnabled(!conflict && records.length > 0 && records.every((record) => record.upiCollectionEnabled === true) && isValidUpiId(records[0]?.upiId ?? ""))
      setScopeIds(scopes.map((vendor) => vendor.id))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load Rawat Farm settings")
      if (reason instanceof Error && reason.message.includes("session")) {
        clearAdminSession()
        router.push("/")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadSettings() }, [router])

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setMessage("")
    if (upiId.trim() && !isValidUpiId(upiId)) {
      setError("Enter a valid UPI ID/VPA.")
      return
    }
    if (upiEnabled && !isValidUpiId(upiId)) {
      setError("Configure a valid UPI ID/VPA before enabling UPI collection.")
      return
    }
    if (upiAccountLast4 && !/^\d{4}$/.test(upiAccountLast4)) {
      setError("Enter exactly four numeric account digits.")
      return
    }
    if (scopeIds.length === 0) {
      setError("Rawat Farm payment settings are not available.")
      return
    }

    setSaving(true)
    try {
      await Promise.all(scopeIds.map((vendorId) => fetchAdminJson(`/api/v1/marketplace/vendors/${vendorId}/payment-settings`, {
        method: "PATCH",
        body: JSON.stringify({ name: "Rawat Farm", upiId: upiId.trim() || null, upiAccountLast4: upiAccountLast4 || null, paymentDisplayName: "Rawat Farm", cashCollectionEnabled: cashEnabled, upiCollectionEnabled: upiEnabled }),
      })))
      setConfigurationConflict(false)
      setMessage("Rawat Farm payment settings saved.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save Rawat Farm settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="app-shell">
      <AdminSidebar />
      <section className="main-content">
        <header className="topbar">
          <div><h1>Settings</h1><p>Rawat Farm business and payment configuration</p></div>
          <button className="top-logout" onClick={() => { clearAdminSession(); router.push("/") }}>Logout</button>
        </header>
        <div className="content">
          <section className="panel">
            <div className="panel-header"><div><h3>Business</h3><p>Customer-facing business identity</p></div></div>
            <div className="info-list">
              <div><span>Business name</span><strong>Rawat Farm</strong></div>
              <div><span>Payment display name</span><strong>Rawat Farm</strong></div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header"><div><h3>Payment methods</h3><p>Cash and Rawat Farm UPI collection</p></div></div>
            {error && <div className="message error" role="alert">{error}</div>}
            {message && <div className="success-message" role="status">{message}</div>}
            {configurationConflict && <div className="message error" role="status">Existing internal payment records do not share one UPI ID. Enter the confirmed Rawat Farm UPI ID to unify collection; no payment data has been changed.</div>}
            {loading ? <div className="empty-state">Loading payment settings...</div> : (
              <form className="vendor-form" onSubmit={saveSettings}>
                <div className="form-grid">
                  <label>Rawat Farm UPI ID / VPA<input value={upiId} onChange={(event) => { setUpiId(event.target.value); if (!isValidUpiId(event.target.value)) setUpiEnabled(false) }} placeholder="Enter confirmed UPI ID" autoComplete="off" /></label>
                  <label>UPI display name<input value="Rawat Farm" readOnly /></label>
                </div>
                <label>Associated account (last 4 digits)<input type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={upiAccountLast4} onChange={(event) => setUpiAccountLast4(event.target.value)} placeholder="Optional; exactly 4 digits" autoComplete="off" /></label>
                {upiAccountLast4 && <p className="muted">Saved account ending: •••• {upiAccountLast4}</p>}
                <label className="check-row"><input type="checkbox" checked={cashEnabled} onChange={(event) => setCashEnabled(event.target.checked)} /> Cash collection enabled</label>
                <label className="check-row"><input type="checkbox" checked={upiEnabled} disabled={!isValidUpiId(upiId)} onChange={(event) => setUpiEnabled(event.target.checked)} /> UPI collection enabled</label>
                <button className="primary-action" type="submit" disabled={saving || loading || (Boolean(upiId.trim()) && !isValidUpiId(upiId)) || (upiEnabled && !isValidUpiId(upiId)) || (Boolean(upiAccountLast4) && !/^\d{4}$/.test(upiAccountLast4))}>{saving ? "Saving..." : "Save payment settings"}</button>
              </form>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}