"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { clearAdminSession, fetchAdminJson, formatCurrency } from "../lib/admin-api"
import { AdminSidebar } from "../components/AdminSidebar"

type Order = {
  id: string
  orderNumber: string
  status: string
  totalAmount: number | string
  orderDate?: string | null
  shop?: { id?: string; name?: string; ownerName?: string | null } | null
  customerId?: string | null
  masterOrder?: { customer?: { name?: string | null; mobile?: string | null; email?: string | null } | null } | null
  deliveries?: Array<{ assignments?: Array<{ user?: { name?: string } | null }> }>
}

const STATUS_OPTIONS = ["ALL", "PLACED", "CONFIRMED", "PICKING", "PACKED", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED", "PAYMENT_PENDING", "CASH_COLLECTED", "UPI_COLLECTED"]

export default function OrdersPage() {
  return (
    <Suspense fallback={<main className="app-shell"><section className="main-content"><div className="detail-loading">Loading orders...</div></section></main>}>
      <OrdersContent />
    </Suspense>
  )
}

function OrdersContent() {
  const router = useRouter()
  const params = useSearchParams()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState(params.get("status") || "ALL")

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const data = await fetchAdminJson<{ items: Order[] }>('/api/v1/orders?page=1&pageSize=200')
        setOrders(data.items ?? [])
      } catch (error) {
        console.error(error)
        if (typeof window !== "undefined" && error instanceof Error && error.message.includes("session")) {
          clearAdminSession()
          router.push("/")
        }
      } finally {
        setLoading(false)
      }
    }

    void loadOrders()
  }, [router])

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase()

    return orders.filter((order) => {
      const normalizedStatus = statusFilter === "ALL" ? true : statusFilter === "PAYMENT_PENDING" ? Number(order.totalAmount ?? 0) > 0 : order.status === statusFilter
      const matchesStatus = statusFilter === "ALL" ? true : normalizedStatus
      const haystack = [order.orderNumber, order.masterOrder?.customer?.name, order.masterOrder?.customer?.mobile, order.masterOrder?.customer?.email, order.customerId].filter(Boolean).join(" ").toLowerCase()
      const matchesSearch = !query || haystack.includes(query)
      return matchesStatus && matchesSearch
    })
  }, [orders, search, statusFilter])

  return (
    <main className="app-shell">
      <AdminSidebar />

      <section className="main-content">
        <header className="topbar">
          <div>
            <h1>Orders</h1>
            <p>Search, filter, and manage Rawat Farm orders</p>
          </div>
          <button className="top-logout" onClick={() => { clearAdminSession(); router.push("/") }}>Logout</button>
        </header>

        <div className="content">
          <section className="panel">
            <div className="vendor-filters">
              <label>
                Search
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order number, customer, shop, phone" />
              </label>
              <label>
                Status
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option.replaceAll("_", " ")}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="panel-header">
              <div>
                <h3>Order queue</h3>
                <p>{visibleOrders.length} order{visibleOrders.length === 1 ? "" : "s"} visible.</p>
              </div>
            </div>

            {loading ? (
              <div className="empty-state">Loading orders...</div>
            ) : visibleOrders.length === 0 ? (
              <div className="empty-state">No matching orders were found.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Business</th>
                      <th>Date</th>
                      <th>Total</th>
                      <th>Delivery partner</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleOrders.map((order) => (
                      <tr key={order.id} className="clickable-row" onClick={() => router.push(`/orders/${order.id}`)}>
                        <td><strong>{order.orderNumber}</strong></td>
                        <td>{order.masterOrder?.customer?.name || order.customerId || "—"}</td>
                        <td><strong>Rawat Farm</strong></td>
                        <td>{order.orderDate ? new Date(order.orderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                        <td><strong>{formatCurrency(order.totalAmount)}</strong></td>
                        <td>{order.deliveries?.[0]?.assignments?.[0]?.user?.name || "—"}</td>
                        <td><span className={`status ${order.status.toLowerCase()}`}>{order.status.replaceAll("_", " ")}</span></td>
                        <td className="arrow">→</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}
