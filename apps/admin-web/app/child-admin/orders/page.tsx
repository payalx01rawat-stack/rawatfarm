"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminSidebar } from "../../components/AdminSidebar"
import { clearAdminSession, fetchAdminJson, formatCurrency, formatDateTime } from "../../lib/admin-api"

type Order = {
  id: string
  orderNumber: string
  status: string
  totalAmount: number | string
  orderDate?: string | null
  masterOrder?: { customer?: { name?: string | null } | null } | null
  customerId?: string | null
  vendor?: { name?: string | null } | null
}
type OrderPage = { items: Order[]; pagination?: { totalPages?: number } }

export default function ChildAdminOrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  async function loadOrders() {
    setLoading(true)
    setError("")
    try {
      const firstPage = await fetchAdminJson<OrderPage>("/api/v1/orders?page=1&pageSize=100")
      const otherPages = await Promise.all(Array.from(
        { length: Math.max(0, (firstPage.pagination?.totalPages ?? 1) - 1) },
        (_, index) => fetchAdminJson<OrderPage>(`/api/v1/orders?page=${index + 2}&pageSize=100`),
      ))
      setOrders([...firstPage.items, ...otherPages.flatMap((page) => page.items)])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load assigned orders.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void loadOrders() }, [])

  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase()
    return orders.filter((order) => !term || [order.orderNumber, order.masterOrder?.customer?.name, order.customerId, order.vendor?.name].filter(Boolean).join(" ").toLowerCase().includes(term))
  }, [orders, search])

  return <main className="app-shell">
    <AdminSidebar />
    <section className="main-content">
      <header className="topbar"><div><h1>Orders</h1><p>Read-only order and fulfillment status.</p></div><button className="top-logout" onClick={() => { clearAdminSession(); router.replace("/") }}>Logout</button></header>
      <div className="content"><section className="panel">
        <div className="vendor-filters"><label>Search orders<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order number, customer, or vendor" /></label></div>
        {error && <div className="message error" role="alert">{error}<button className="secondary-action" onClick={() => void loadOrders()} disabled={loading}>Retry</button></div>}
        {loading ? <div className="empty-state">Loading orders...</div> : visibleOrders.length === 0 ? <div className="empty-state">No orders match this search.</div> : <div className="table-wrap"><table>
          <thead><tr><th>Order</th><th>Customer</th><th>Vendor</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>{visibleOrders.map((order) => <tr key={order.id}><td>{order.orderNumber}</td><td>{order.masterOrder?.customer?.name || order.customerId || "—"}</td><td>{order.vendor?.name || "—"}</td><td>{formatDateTime(order.orderDate)}</td><td>{formatCurrency(order.totalAmount)}</td><td>{order.status}</td></tr>)}</tbody>
        </table></div>}
      </section></div>
    </section>
  </main>
}
