"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:4000"

type Shop = {
  id: string
  name: string
  ownerName?: string
  primaryMobile?: string
  whatsappNumber?: string
  isActive?: boolean
}

export default function ShopsPage() {
  const router = useRouter()
  const [shops, setShops] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadShops() {
      const token = localStorage.getItem("farmmitra_access_token")

      if (!token) {
        router.push("/")
        return
      }

      try {
        const response = await fetch(`${API_URL}/api/v1/shops`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load shops")
        }

        setShops(data.items ?? data.shops ?? [])
      } catch (error) {
        console.error(error)
      } finally {
        setLoading(false)
      }
    }

    loadShops()
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
            <span>▦</span> Dashboard
          </button>

          <button className="nav-item" onClick={() => router.push("/orders")}>
            <span>▤</span> Orders
          </button>

          <button className="nav-item active">
            <span>◉</span> Shops
          </button>

          <button className="nav-item" onClick={() => router.push("/products")}>
            <span>□</span> Products
          </button>

          <button className="nav-item" onClick={() => router.push("/delivery")}>
            <span>⌁</span> Delivery
          </button>

          <button className="nav-item" onClick={() => router.push("/reports")}>
            <span>◫</span> Reports
          </button>
        </nav>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div>
            <h1>Shops</h1>
            <p>Manage FarmMitra business customers.</p>
          </div>
        </header>

        <div className="content">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h3>All Shops</h3>
                <p>Registered FarmMitra shops.</p>
              </div>
            </div>

            {loading ? (
              <div className="empty-state">Loading shops...</div>
            ) : shops.length === 0 ? (
              <div className="empty-state">No shops found.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Shop</th>
                      <th>Owner</th>
                      <th>Mobile</th>
                      <th>WhatsApp</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {shops.map((shop) => (
                      <tr key={shop.id}>
                        <td><strong>{shop.name}</strong></td>
                        <td>{shop.ownerName || "—"}</td>
                        <td>{shop.primaryMobile || "—"}</td>
                        <td>{shop.whatsappNumber || "—"}</td>
                        <td>
                          <span className="status delivered">
                            {shop.isActive === false ? "INACTIVE" : "ACTIVE"}
                          </span>
                        </td>
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
