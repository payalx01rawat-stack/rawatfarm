"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminSidebar } from "../../components/AdminSidebar"
import { clearAdminSession, fetchAdminJson, formatDateTime } from "../../lib/admin-api"

type Customer = { id: string; name: string; email?: string | null; mobile?: string | null; status: string; createdAt?: string }

export default function ChildAdminCustomersPage() {
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  async function loadCustomers() {
    setLoading(true)
    setError("")
    try {
      const result = await fetchAdminJson<Customer[]>("/api/v1/users")
      setCustomers(result)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load the assigned customer list.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadCustomers() }, [])

  const visibleCustomers = useMemo(() => {
    const term = search.trim().toLowerCase()
    return customers.filter((customer) => !term || [customer.name, customer.email, customer.mobile].filter(Boolean).join(" ").toLowerCase().includes(term))
  }, [customers, search])

  return <main className="app-shell">
    <AdminSidebar />
    <section className="main-content">
      <header className="topbar"><div><h1>Customers</h1><p>Read-only customer account details.</p></div><button className="top-logout" onClick={() => { clearAdminSession(); router.replace("/") }}>Logout</button></header>
      <div className="content"><section className="panel">
        <div className="vendor-filters"><label>Search customers<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, or mobile" /></label></div>
        {error && <div className="message error" role="alert">{error}<button className="secondary-action" onClick={() => void loadCustomers()} disabled={loading}>Retry</button></div>}
        {loading ? <div className="empty-state">Loading customers...</div> : visibleCustomers.length === 0 ? <div className="empty-state">No customers match this search.</div> : <div className="table-wrap"><table>
          <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Status</th><th>Joined</th></tr></thead>
          <tbody>{visibleCustomers.map((customer) => <tr key={customer.id}><td>{customer.name}</td><td>{customer.email || "—"}</td><td>{customer.mobile || "—"}</td><td>{customer.status}</td><td>{formatDateTime(customer.createdAt)}</td></tr>)}</tbody>
        </table></div>}
      </section></div>
    </section>
  </main>
}
