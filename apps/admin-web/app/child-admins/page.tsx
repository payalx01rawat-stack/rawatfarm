"use client"

import { FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminSidebar } from "../components/AdminSidebar"
import { clearAdminSession, fetchAdminJson, formatDateTime } from "../lib/admin-api"

type User = { id: string; name: string; email?: string | null; mobile?: string | null; status: string; createdAt?: string; roles: string[]; childAdminPermissions: string[] }
type ChildAdminInput = { name: string; email: string; mobile: string; password: string }
const emptyInput: ChildAdminInput = { name: "", email: "", mobile: "", password: "" }
const accessGroups = [
  { label: "Customer list", permissionNames: ["users.read"] },
  { label: "Product management", permissionNames: ["catalog.categories.read", "catalog.units.read", "catalog.products.read", "catalog.products.create", "catalog.products.update"] },
  { label: "Shop pricing (includes customer selector)", permissionNames: ["shops.read", "catalog.prices.read", "catalog.prices.create", "catalog.prices.update"] },
  { label: "Orders", permissionNames: ["orders.read"] },
]

export default function ChildAdminsPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [input, setInput] = useState(emptyInput)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [accountsLoadError, setAccountsLoadError] = useState("")
  const [message, setMessage] = useState("")
  const [accessUser, setAccessUser] = useState<User | null>(null)
  const [accessDraft, setAccessDraft] = useState<string[]>([])

  async function loadUsers() {
    setLoading(true)
    setError("")
    setAccountsLoadError("")
    try {
      const allUsers = await fetchAdminJson<User[]>("/api/v1/users")
      if (!Array.isArray(allUsers) || allUsers.some((user) => !user || !Array.isArray(user.roles))) {
        throw new Error("The API returned an unexpected response while loading accounts.")
      }
      setUsers(allUsers.filter((user) => user.roles.includes("CHILD_ADMIN")))
    } catch (reason) {
      const message = reason instanceof TypeError
        ? "Could not reach the FarmMitra API. Check that the API server is running and try again."
        : reason instanceof Error
          ? reason.message
          : "Unable to load Child Admin accounts."
      setError(message)
      setAccountsLoadError(message)
      if (reason instanceof Error && reason.message.includes("session")) {
        clearAdminSession()
        router.replace("/")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadUsers() }, [])

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError("")
    setMessage("")
    setSaving(true)
    try {
      await fetchAdminJson("/api/v1/users", {
        method: "POST",
        body: JSON.stringify({ name: input.name, email: input.email, ...(input.mobile ? { mobile: input.mobile } : {}), password: input.password, roleNames: ["CHILD_ADMIN"] }),
      })
      setInput(emptyInput)
      setMessage("Child Admin account created.")
      await loadUsers()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create Child Admin account")
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(user: User, status: "ACTIVE" | "INACTIVE") {
    setError("")
    setMessage("")
    setSaving(true)
    try {
      await fetchAdminJson(`/api/v1/users/${encodeURIComponent(user.id)}`, { method: "PATCH", body: JSON.stringify({ status }) })
      setMessage(status === "ACTIVE" ? "Child Admin account activated." : "Child Admin account deactivated.")
      await loadUsers()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update Child Admin account")
    } finally {
      setSaving(false)
    }
  }

  async function revokeRole(user: User) {
    if (!window.confirm(`Revoke Child Admin access for ${user.name}? The account will be deactivated.`)) return
    setError("")
    setMessage("")
    setSaving(true)
    try {
      await fetchAdminJson(`/api/v1/users/${encodeURIComponent(user.id)}/roles`, { method: "DELETE", body: JSON.stringify({ roleName: "CHILD_ADMIN" }) })
      setMessage(`Child Admin access revoked for ${user.name}.`)
      await loadUsers()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to revoke Child Admin access")
    } finally {
      setSaving(false)
    }
  }

  function editAccess(user: User) {
    setAccessUser(user)
    setAccessDraft(user.childAdminPermissions || [])
    setError("")
    setMessage("")
  }

  function toggleAccessGroup(permissionNames: string[]) {
    const enabled = permissionNames.every((permission) => accessDraft.includes(permission))
    setAccessDraft((current) => enabled
      ? current.filter((permission) => !permissionNames.includes(permission))
      : Array.from(new Set([...current, ...permissionNames])))
  }

  async function saveAccess() {
    if (!accessUser) return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      await fetchAdminJson(`/api/v1/users/${encodeURIComponent(accessUser.id)}/child-admin-permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissionNames: accessDraft }),
      })
      setMessage(`Resource access updated for ${accessUser.name}.`)
      setAccessUser(null)
      await loadUsers()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update Child Admin access")
    } finally {
      setSaving(false)
    }
  }

  return <main className="app-shell">
    <AdminSidebar />
    <section className="main-content">
      <header className="topbar"><div><h1>Child Admin accounts</h1><p>Create and manage read-only administrator access.</p></div><button className="top-logout" onClick={() => { clearAdminSession(); router.replace("/") }}>Logout</button></header>
      <div className="content">
        {error && <div className="message error" role="alert">{error}<button className="secondary-action" onClick={() => void loadUsers()} disabled={loading}>Retry</button></div>}
        {message && <div className="message" role="status">{message}</div>}
        <section className="panel">
          <div className="panel-header"><div><h3>Create Child Admin</h3><p>New accounts have no business access until a Super Admin assigns resources.</p></div></div>
          <form className="admin-form-grid" onSubmit={createAccount}>
            <label>Name<input value={input.name} onChange={(event) => setInput({ ...input, name: event.target.value })} minLength={2} maxLength={191} required /></label>
            <label>Email<input type="email" value={input.email} onChange={(event) => setInput({ ...input, email: event.target.value })} required /></label>
            <label>Mobile<input type="tel" value={input.mobile} onChange={(event) => setInput({ ...input, mobile: event.target.value })} /></label>
            <label>Initial password<input type="password" autoComplete="new-password" value={input.password} onChange={(event) => setInput({ ...input, password: event.target.value })} minLength={8} maxLength={128} required /></label>
            <button type="submit" disabled={saving}>{saving ? "Saving..." : "Create account"}</button>
          </form>
        </section>
        <section className="panel">
          <div className="panel-header"><div><h3>Accounts</h3><p>{users.length} Child Admin accounts</p></div></div>
          {loading ? <div className="empty-state">Loading accounts...</div> : accountsLoadError ? <div className="empty-state" role="status">Accounts could not be loaded. Use Retry above to try again.</div> : users.length === 0 ? <div className="empty-state">No Child Admin accounts.</div> : <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Status</th><th>Created</th><th>Access</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email || "—"}</td><td>{user.mobile || "—"}</td><td>{user.status}</td><td>{formatDateTime(user.createdAt)}</td><td><div className="customer-access-actions"><button disabled={saving} onClick={() => editAccess(user)}>Manage resources</button><button disabled={saving} onClick={() => void setStatus(user, user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>{user.status === "ACTIVE" ? "Deactivate" : "Activate"}</button><button disabled={saving} onClick={() => void revokeRole(user)}>Revoke access</button></div></td></tr>)}</tbody></table></div>}
        </section>
        {accessUser && <section className="panel">
          <div className="panel-header"><div><h3>Resource access for {accessUser.name}</h3><p>Only checked resources are authorized by the API. Shop pricing includes access to the customer selector.</p></div></div>
          <div className="admin-form-grid">{accessGroups.map((group) => {
            const checked = group.permissionNames.every((permission) => accessDraft.includes(permission))
            return <label key={group.label}><input type="checkbox" checked={checked} disabled={saving} onChange={() => toggleAccessGroup(group.permissionNames)} /> {group.label}</label>
          })}</div>
          <div className="product-form-actions"><button className="primary-action" disabled={saving} onClick={() => void saveAccess()}>{saving ? "Saving..." : "Save resource access"}</button><button className="secondary-action" disabled={saving} onClick={() => setAccessUser(null)}>Cancel</button></div>
        </section>}
      </div>
    </section>
  </main>
}