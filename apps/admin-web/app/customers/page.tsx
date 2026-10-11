"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminSidebar } from "../components/AdminSidebar"
import { clearAdminSession, fetchAdminJson, formatDateTime } from "../lib/admin-api"

type User = { id: string; name: string; email?: string | null; mobile?: string | null; status?: string; createdAt?: string; roles?: string[] }
type Enrollment = { name: string; email: string; mobile: string; password: string }

const emptyEnrollment: Enrollment = { name: "", email: "", mobile: "", password: "" }

export default function CustomersPage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<User[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [enrollment, setEnrollment] = useState(emptyEnrollment)
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({})

  async function loadCustomers() {
    setLoading(true)
    try {
      const users = await fetchAdminJson<User[]>("/api/v1/users")
      setCustomers(users.filter((user) => user.roles?.includes("CUSTOMER")))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load customers")
      if (reason instanceof Error && reason.message.includes("session")) {
        clearAdminSession()
        router.push("/")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadCustomers() }, [router])

  const visibleCustomers = useMemo(() => {
    const query = search.trim().toLowerCase()
    return customers.filter((customer) => !query || [customer.name, customer.email, customer.mobile].filter(Boolean).join(" ").toLowerCase().includes(query))
  }, [customers, search])

  async function enrollCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setMessage("")
    setSaving(true)
    try {
      const customer = await fetchAdminJson<User>("/api/v1/users", {
        method: "POST",
        body: JSON.stringify({
          name: enrollment.name.trim(),
          ...(enrollment.email.trim() ? { email: enrollment.email.trim() } : {}),
          ...(enrollment.mobile.trim() ? { mobile: enrollment.mobile.trim() } : {}),
          password: enrollment.password,
          roleNames: ["CUSTOMER"],
        }),
      })
      setCustomers((current) => [customer, ...current])
      setEnrollment(emptyEnrollment)
      setMessage("Customer account enrolled. Share the initial credentials with the customer using your approved secure channel.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to enroll customer")
    } finally {
      setSaving(false)
    }
  }

  async function setCustomerStatus(customer: User, status: "ACTIVE" | "INACTIVE") {
    setError("")
    setMessage("")
    setSaving(true)
    try {
      const updated = await fetchAdminJson<User>(`/api/v1/users/${encodeURIComponent(customer.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      })
      setCustomers((current) => current.map((item) => item.id === updated.id ? updated : item))
      setMessage(status === "ACTIVE" ? "Customer account activated." : "Customer account deactivated.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update customer account")
    } finally {
      setSaving(false)
    }
  }

  async function resetPassword(customer: User) {
    const password = passwordDrafts[customer.id] || ""
    if (password.length < 8 || password.length > 128) {
      setError("Enter a new password between 8 and 128 characters.")
      return
    }
    setError("")
    setMessage("")
    setSaving(true)
    try {
      await fetchAdminJson(`/api/v1/users/${encodeURIComponent(customer.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ password }),
      })
      setPasswordDrafts((current) => ({ ...current, [customer.id]: "" }))
      setMessage(`Password reset for ${customer.name}. Share it using your approved secure channel.`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to reset password")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="app-shell">
      <AdminSidebar />
      <section className="main-content">
        <header className="topbar">
          <div><h1>Customers</h1><p>Enroll customers and manage access to Rawat Farm orders.</p></div>
          <button className="top-logout" onClick={() => { clearAdminSession(); router.push("/") }}>Logout</button>
        </header>
        <div className="content">
          <section className="panel">
            <div className="panel-header"><div><h3>Enroll customer</h3><p>Only administrator-enrolled accounts can sign in to customer shopping.</p></div></div>
            <form className="admin-form-grid" onSubmit={enrollCustomer}>
              <label>Name<input value={enrollment.name} onChange={(event) => setEnrollment({ ...enrollment, name: event.target.value })} minLength={2} maxLength={191} required /></label>
              <label>Email<input type="email" value={enrollment.email} onChange={(event) => setEnrollment({ ...enrollment, email: event.target.value })} /></label>
              <label>Mobile<input type="tel" value={enrollment.mobile} onChange={(event) => setEnrollment({ ...enrollment, mobile: event.target.value })} /></label>
              <label>Initial password<input type="password" autoComplete="new-password" value={enrollment.password} onChange={(event) => setEnrollment({ ...enrollment, password: event.target.value })} minLength={8} maxLength={128} required /></label>
              <button type="submit" disabled={saving}>{saving ? "Saving..." : "Enroll customer"}</button>
            </form>
            <p className="muted">Enter an email or mobile number. Passwords are hashed by the API and are never returned to this page.</p>
          </section>
          <section className="panel">
            <div className="vendor-filters"><label>Search customers<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, or mobile" /></label></div>
            <div className="panel-header"><div><h3>Customer accounts</h3><p>{visibleCustomers.length} customers</p></div></div>
            {error && <div className="message error" role="alert">{error}</div>}
            {message && <div className="message" role="status">{message}</div>}
            {loading ? <div className="empty-state">Loading customers...</div> : visibleCustomers.length === 0 ? <div className="empty-state">No customers match your search.</div> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Customer</th><th>Email</th><th>Mobile</th><th>Status</th><th>Joined</th><th>Account access</th></tr></thead>
                <tbody>{visibleCustomers.map((customer) => <tr key={customer.id}>
                  <td><button className="customer-link" onClick={() => router.push(`/customers/${customer.id}`)}>{customer.name}</button></td>
                  <td>{customer.email || "—"}</td>
                  <td>{customer.mobile || "—"}</td>
                  <td><span className={`status-pill ${customer.status === "ACTIVE" ? "approved" : "suspended"}`}>{customer.status || "—"}</span></td>
                  <td>{formatDateTime(customer.createdAt)}</td>
                  <td><div className="customer-access-actions">
                    <button disabled={saving} onClick={() => void setCustomerStatus(customer, customer.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>{customer.status === "ACTIVE" ? "Deactivate" : "Activate"}</button>
                    <input type="password" autoComplete="new-password" placeholder="New password" aria-label={`New password for ${customer.name}`} value={passwordDrafts[customer.id] || ""} onChange={(event) => setPasswordDrafts((current) => ({ ...current, [customer.id]: event.target.value }))} />
                    <button disabled={saving} onClick={() => void resetPassword(customer)}>Reset password</button>
                  </div></td>
                </tr>)}</tbody>
              </table></div>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}
