"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminSidebar } from "../components/AdminSidebar"
import { clearAdminSession } from "../lib/admin-api"

type Access = { href: string; permission: string; title: string; description: string }

const availableAccess: Access[] = [
  { href: "/child-admin/products", permission: "catalog.products.read", title: "Product management", description: "Manage assigned catalog products and status." },
  { href: "/child-admin/pricing", permission: "catalog.prices.read", title: "Shop pricing", description: "Manage assigned shop rates and customer pricing." },
  { href: "/child-admin/customers", permission: "users.read", title: "Customer list", description: "View customer contact and account status." },
  { href: "/child-admin/orders", permission: "orders.read", title: "Orders", description: "Review customer orders and fulfillment status." },
]

export default function ChildAdminPage() {
  const router = useRouter()
  const [permissions, setPermissions] = useState<string[]>([])

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem("farmmitra_user") || "null") as { childAdminPermissions?: unknown } | null
      setPermissions(Array.isArray(user?.childAdminPermissions)
        ? user.childAdminPermissions.filter((permission): permission is string => typeof permission === "string")
        : [])
    } catch {
      setPermissions([])
    }
  }, [])

  return <main className="app-shell">
    <AdminSidebar />
    <section className="main-content">
      <header className="topbar">
        <div><h1>Child Admin workspace</h1><p>Only resources assigned to your account are available.</p></div>
        <button className="top-logout" onClick={() => { clearAdminSession(); router.replace("/") }}>Logout</button>
      </header>
      <div className="content">
        {availableAccess.filter((item) => permissions.includes(item.permission)).length === 0
          ? <section className="panel"><div className="empty-state">No resources are assigned to this account. Contact a Super Admin to request access.</div></section>
          : <div className="stats-grid">{availableAccess.filter((item) => permissions.includes(item.permission)).map((item) => <button className="stat-card" key={item.href} onClick={() => router.push(item.href)}><div><strong>{item.title}</strong><small>{item.description}</small></div></button>)}</div>}
      </div>
    </section>
  </main>
}
