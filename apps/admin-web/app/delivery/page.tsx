"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminSidebar } from "../components/AdminSidebar"
import { clearAdminSession, fetchAdminJson } from "../lib/admin-api"

type User = { id: string; name: string; email?: string | null; mobile?: string | null; status?: string; roles?: string[] }
type PartnerLink = {
  user: { id: string; name: string; email?: string | null; mobile?: string | null; status?: string; roles?: Array<{ role?: { name?: string } }> }
  vendor?: { id?: string } | null
  capabilities?: string[] | null
  isActive?: boolean
}
type VendorScope = { id: string; status?: string; isActive?: boolean }
type Order = { id: string; orderNumber: string; status: string; deliveries?: Array<{ assignments?: Array<{ userId: string }> }> }
type DeliveryGuy = { user: User; vendorIds: string[]; isActive: boolean; assignedOrders: Array<{ id: string; orderNumber: string; status: string }> }
type NewGuy = { name: string; email: string; mobile: string; password: string }

const emptyGuy: NewGuy = { name: "", email: "", mobile: "", password: "" }
const deliveryRoles = ["DELIVERY_PARTNER", "DELIVERY_STAFF"]

export default function DeliveryPage() {
  const router = useRouter()
  const [guys, setGuys] = useState<DeliveryGuy[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [vendorScopes, setVendorScopes] = useState<VendorScope[]>([])
  const [newGuy, setNewGuy] = useState(emptyGuy)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  async function loadData() {
    setLoading(true)
    setError("")
    try {
      const [partnerLinks, vendorData, userData, orderData] = await Promise.all([
        fetchAdminJson<PartnerLink[]>("/api/v1/marketplace/admin/delivery-partners"),
        fetchAdminJson<VendorScope[]>("/api/v1/marketplace/admin/vendors"),
        fetchAdminJson<User[]>("/api/v1/users"),
        fetchAdminJson<{ items: Order[] }>("/api/v1/orders?page=1&pageSize=100"),
      ])
      const groups = new Map<string, DeliveryGuy>()
      for (const link of partnerLinks) {
        const roles = link.user.roles?.map(({ role }) => role?.name ?? "") ?? []
        if (!roles.some((role) => deliveryRoles.includes(role))) continue
        const user: User = { ...link.user, roles }
        const group = groups.get(user.id) ?? { user, vendorIds: [], isActive: user.status === "ACTIVE", assignedOrders: [] }
        if (link.vendor?.id && !group.vendorIds.includes(link.vendor.id)) group.vendorIds.push(link.vendor.id)
        group.isActive = group.isActive && link.isActive !== false
        groups.set(user.id, group)
      }
      for (const order of orderData.items) {
        for (const delivery of order.deliveries ?? []) {
          for (const assignment of delivery.assignments ?? []) {
            const group = groups.get(assignment.userId)
            if (group && !group.assignedOrders.some((item) => item.id === order.id)) {
              group.assignedOrders.push({ id: order.id, orderNumber: order.orderNumber, status: order.status })
            }
          }
        }
      }
      setGuys(Array.from(groups.values()).sort((left, right) => left.user.name.localeCompare(right.user.name)))
      setUsers(userData)
      setVendorScopes(vendorData.filter((vendor) => vendor.isActive && vendor.status === "APPROVED"))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load delivery staff")
      if (reason instanceof Error && reason.message.includes("session")) {
        clearAdminSession()
        router.push("/")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadData() }, [])

  async function addDeliveryGuy(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setSuccess("")
    if (vendorScopes.length === 0) {
      setError("Rawat Farm delivery coverage is not configured.")
      return
    }

    setBusy(true)
    try {
      const email = newGuy.email.trim().toLowerCase()
      const mobile = newGuy.mobile.trim()
      const existing = users.find((user) => (email && user.email?.toLowerCase() === email) || (mobile && user.mobile === mobile))
      let user = existing
      if (existing && (!existing.roles?.some((role) => deliveryRoles.includes(role)) || existing.status !== "ACTIVE")) {
        throw new Error("An existing account uses that email or mobile but is not an active delivery guy.")
      }
      if (!user) {
        user = await fetchAdminJson<User>("/api/v1/users", {
          method: "POST",
          body: JSON.stringify({ name: newGuy.name.trim(), email, mobile: mobile || undefined, password: newGuy.password, roleNames: deliveryRoles }),
        })
      }
      await Promise.all(vendorScopes.map((vendor) => fetchAdminJson(`/api/v1/marketplace/vendors/${vendor.id}/delivery-partners`, {
        method: "POST",
        body: JSON.stringify({ userId: user!.id, capabilities: ["DELIVERY", "PAYMENT_COLLECTION"] }),
      })))
      setNewGuy(emptyGuy)
      setSuccess(`${user.name} is now a Rawat Farm delivery guy.`)
      await loadData()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to add delivery guy")
    } finally {
      setBusy(false)
    }
  }

  async function toggleDeliveryGuy(guy: DeliveryGuy) {
    setBusy(true)
    setError("")
    setSuccess("")
    const nextActive = !guy.isActive
    try {
      await fetchAdminJson(`/api/v1/users/${guy.user.id}`, { method: "PATCH", body: JSON.stringify({ status: nextActive ? "ACTIVE" : "INACTIVE" }) })
      await Promise.all(guy.vendorIds.map((vendorId) => fetchAdminJson(`/api/v1/marketplace/vendors/${vendorId}/delivery-partners/${guy.user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: nextActive, capabilities: ["DELIVERY", "PAYMENT_COLLECTION"] }),
      })))
      setSuccess(`${guy.user.name} ${nextActive ? "activated" : "deactivated"}.`)
      await loadData()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update delivery guy")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app-shell">
      <AdminSidebar />
      <section className="main-content">
        <header className="topbar">
          <div><h1>Delivery Guys</h1><p>Rawat Farm delivery team and assigned orders</p></div>
          <button className="top-logout" onClick={() => { clearAdminSession(); router.push("/") }}>Logout</button>
        </header>
        <div className="content">
          <section className="panel">
            <div className="panel-header"><div><h3>Add Delivery Guy</h3><p>New accounts receive the existing delivery and payment-collection roles.</p></div></div>
            {error && <div className="message error" role="alert">{error}</div>}
            {success && <div className="success-message" role="status">{success}</div>}
            <form className="vendor-form" onSubmit={addDeliveryGuy}>
              <div className="form-grid">
                <label>Name<input required minLength={2} value={newGuy.name} onChange={(event) => setNewGuy({ ...newGuy, name: event.target.value })} autoComplete="name" /></label>
                <label>Email<input required type="email" value={newGuy.email} onChange={(event) => setNewGuy({ ...newGuy, email: event.target.value })} autoComplete="email" /></label>
                <label>Mobile<input type="tel" value={newGuy.mobile} onChange={(event) => setNewGuy({ ...newGuy, mobile: event.target.value })} autoComplete="tel" /></label>
                <label>Password<input required type="password" minLength={8} value={newGuy.password} onChange={(event) => setNewGuy({ ...newGuy, password: event.target.value })} autoComplete="new-password" /></label>
              </div>
              <button className="primary-action" disabled={busy || loading}>{busy ? "Saving..." : "Add Delivery Guy"}</button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-header"><div><h3>Delivery Guys</h3><p>{guys.filter((guy) => guy.isActive).length} active</p></div><button className="secondary-action" onClick={() => void loadData()}>Refresh</button></div>
            {loading ? <div className="empty-state">Loading delivery guys...</div> : guys.length === 0 ? <div className="empty-state">No delivery guys found.</div> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Delivery Guy</th><th>Contact</th><th>Assigned Orders</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>{guys.map((guy) => <tr key={guy.user.id}>
                  <td><strong>{guy.user.name}</strong><small>Rawat Farm</small></td>
                  <td>{guy.user.mobile || guy.user.email || "—"}</td>
                  <td>{guy.assignedOrders.length ? <details><summary>{guy.assignedOrders.length} assigned</summary>{guy.assignedOrders.map((order) => <button className="text-action" key={order.id} onClick={() => router.push(`/orders/${order.id}`)}>{order.orderNumber} · {order.status.replaceAll("_", " ")}</button>)}</details> : "—"}</td>
                  <td><span className={`status-pill ${guy.isActive ? "approved" : "suspended"}`}>{guy.isActive ? "Active" : "Inactive"}</span></td>
                  <td><button className="secondary-action" disabled={busy} onClick={() => void toggleDeliveryGuy(guy)}>{guy.isActive ? "Deactivate" : "Activate"}</button></td>
                </tr>)}</tbody>
              </table></div>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}
