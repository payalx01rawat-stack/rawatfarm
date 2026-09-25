"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:4000"

type Order = {
  id: string
  orderNumber: string
  status: string
  totalAmount: string
  shop?: {
    name?: string
  }
}

export default function DashboardPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const token = localStorage.getItem("farmmitra_access_token")

        const response = await fetch(`${API_URL}/api/v1/orders`, {
          headers: token
            ? {
                Authorization: `Bearer ${token}`,
              }
            : {},
        })

        if (!response.ok) {
          throw new Error("Failed to load orders")
        }

        const data = await response.json()
        setOrders(data.items ?? [])
      } catch (error) {
        console.error(error)
      } finally {
        setLoading(false)
      }
    }

    loadOrders()
  }, [])

  const totalRevenue = orders.reduce(
    (sum, order) => sum + Number(order.totalAmount || 0),
    0
  )

  const pendingOrders = orders.filter(
    (order) =>
      !["DELIVERED", "CANCELLED"].includes(order.status)
  ).length

  const deliveredOrders = orders.filter(
    (order) => order.status === "DELIVERED"
  ).length

  const cancelledOrders = orders.filter(
    (order) => order.status === "CANCELLED"
  ).length

  const logout = () => {
    localStorage.removeItem("farmmitra_access_token")
    localStorage.removeItem("farmmitra_user")
    router.push("/")
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo">FM</div>
          <div>
            <strong>FarmMitra</strong>
            <span>Admin Portal</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className="nav-item active"
            onClick={() => router.push("/dashboard")}
          >
            <span>▦</span>
            Dashboard
          </button>

          <button
            className="nav-item"
            onClick={() => router.push("/orders")}
          >
            <span>▤</span>
            Orders
          </button>

          <button
            className="nav-item"
            onClick={() => router.push("/shops")}
          >
            <span>◉</span>
            Shops
          </button>

          <button
            className="nav-item"
            onClick={() => router.push("/products")}
          >
            <span>□</span>
            Products
          </button>

          <button
            className="nav-item"
            onClick={() => router.push("/delivery")}
          >
            <span>⌁</span>
            Delivery
          </button>

          <button
            className="nav-item"
            onClick={() => router.push("/reports")}
          >
            <span>◫</span>
            Reports
          </button>
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item" onClick={logout}>
            <span>↪</span>
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <h1>Dashboard</h1>
            <p>FarmMitra business overview</p>
          </div>

          <div className="topbar-user">
            <div className="avatar">FM</div>
            <div>
              <strong>FarmMitra Admin</strong>
              <span>Administrator</span>
            </div>
          </div>
        </header>

        <section className="content">
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Total Revenue</span>
              <strong>INR {totalRevenue.toLocaleString("en-IN")}</strong>
              <small>Across all orders</small>
            </div>

            <div className="stat-card">
              <span className="stat-label">Total Orders</span>
              <strong>{orders.length}</strong>
              <small>All recorded orders</small>
            </div>

            <div className="stat-card">
              <span className="stat-label">Pending Orders</span>
              <strong>{pendingOrders}</strong>
              <small>Currently in progress</small>
            </div>

            <div className="stat-card">
              <span className="stat-label">Delivered</span>
              <strong>{deliveredOrders}</strong>
              <small>{cancelledOrders} cancelled</small>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <div>
                <h2>Recent Orders</h2>
                <p>Latest orders received by FarmMitra.</p>
              </div>

              <button
                className="primary-button"
                onClick={() => router.push("/orders")}
              >
                View All Orders
              </button>
            </div>

            {loading ? (
              <div className="empty-state">
                Loading orders...
              </div>
            ) : orders.length === 0 ? (
              <div className="empty-state">
                No orders found.
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Shop</th>
                      <th>Status</th>
                      <th>Total</th>
                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        onClick={() =>
                          router.push(`/orders/${order.id}`)
                        }
                        style={{ cursor: "pointer" }}
                      >
                        <td>
                          <strong>{order.orderNumber}</strong>
                        </td>

                        <td>
                          {order.shop?.name || "—"}
                        </td>

                        <td>
                          <span
                            className={`status-badge status-${order.status.toLowerCase()}`}
                          >
                            {order.status}
                          </span>
                        </td>

                        <td>
                          INR{" "}
                          {Number(
                            order.totalAmount || 0
                          ).toLocaleString("en-IN")}
                        </td>

                        <td>→</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
