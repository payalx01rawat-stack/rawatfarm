"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:4000"

type Order = {
  id: string
  orderNumber: string
  totalAmount: number | string
  status: string
  orderDate: string
  shop?: {
    name?: string
    ownerName?: string
  }
}

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadOrders() {
      const token = localStorage.getItem("farmmitra_access_token")

      if (!token) {
        router.push("/")
        return
      }

      try {
        const response = await fetch(`${API_URL}/api/v1/orders`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data?.error || "Unable to load orders")
        }

        setOrders(data.items ?? [])
      } catch (error) {
        console.error(error)
      } finally {
        setLoading(false)
      }
    }

    loadOrders()
  }, [router])

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="logo">FM</div>
          <div>
            <strong>FarmMitra</strong>
            <span>Admin Portal</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button className="nav-item" onClick={() => router.push("/dashboard")}>
            <span>▦</span>
            Dashboard
          </button>

          <button className="nav-item active">
            <span>▤</span>
            Orders
          </button>

          <button className="nav-item">
            <span>◉</span>
            Shops
          </button>

          <button className="nav-item">
            <span>□</span>
            Products
          </button>

          <button className="nav-item">
            <span>⌁</span>
            Delivery
          </button>

          <button className="nav-item">
            <span>◫</span>
            Reports
          </button>
        </nav>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div>
            <h1>Orders</h1>
            <p>Manage and track all FarmMitra orders.</p>
          </div>
        </header>

        <div className="content">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h3>All Orders</h3>
                <p>
                  {orders.length} order
                  {orders.length === 1 ? "" : "s"} found.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="empty-state">Loading orders...</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Shop</th>
                      <th>Date</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>

                  <tbody>
                    {orders.map((order) => (
                      <tr
                        key={order.id}
                        className="clickable-row"
                        onClick={() =>
                          router.push(`/orders/${order.id}`)
                        }
                      >
                        <td>
                          <strong>{order.orderNumber}</strong>
                        </td>

                        <td>
                          <div className="shop-cell">
                            <strong>{order.shop?.name || "Shop"}</strong>
                            <span>{order.shop?.ownerName || ""}</span>
                          </div>
                        </td>

                        <td>
                          {new Date(order.orderDate).toLocaleDateString(
                            "en-IN",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            }
                          )}
                        </td>

                        <td>
                          <strong>
                            INR{" "}
                            {Number(order.totalAmount).toLocaleString(
                              "en-IN"
                            )}
                          </strong>
                        </td>

                        <td>
                          <span
                            className={`status ${order.status.toLowerCase()}`}
                          >
                            {order.status.replaceAll("_", " ")}
                          </span>
                        </td>

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
