"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

type ShopUser = {
  id?: string
  name?: string
  mobile?: string | null
  email?: string | null
  roles?: string[]
}

export default function DashboardPage() {
  const router = useRouter()

  const [user, setUser] = useState<ShopUser | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const savedUser = localStorage.getItem("farmmitra_shop_user")

    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch {
        localStorage.removeItem("farmmitra_shop_user")
      }
    }

    setLoaded(true)
  }, [])

  function logout() {
    localStorage.removeItem("farmmitra_shop_token")
    localStorage.removeItem("farmmitra_shop_user")
    router.replace("/")
  }

  if (!loaded) {
    return (
      <main className="dashboard-page">
        <section className="dashboard-content">
          <div className="welcome-card">
            <div>
              <span className="eyebrow">SHOP DASHBOARD</span>
              <h1>Welcome to FarmMitra 👋</h1>
              <p>Loading your shop account...</p>
            </div>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <div className="brand-small">
            <span>FM</span>
            <strong>FarmMitra</strong>
          </div>
          <p>Shop Ordering Portal</p>
        </div>

        <button className="logout-button" onClick={logout}>
          Logout
        </button>
      </header>

      <section className="dashboard-content">
        <div className="welcome-card">
          <div>
            <span className="eyebrow">SHOP DASHBOARD</span>
            <h1>Welcome, {user?.name || "Shop Owner"} 👋</h1>
            <p>
              Manage your FarmMitra orders and shop account from here.
            </p>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <span>Pending Orders</span>
            <strong>0</strong>
          </div>

          <div className="stat-card">
            <span>Today's Orders</span>
            <strong>0</strong>
          </div>

          <div className="stat-card">
            <span>Delivered Orders</span>
            <strong>0</strong>
          </div>

          <div className="stat-card">
            <span>Outstanding</span>
            <strong>₹0</strong>
          </div>
        </div>

        <div className="actions-grid">
          <button
            className="action-card"
            onClick={() => router.push("/new-order")}
          >
            <span className="action-icon">🛒</span>
            <strong>New Order</strong>
            <small>Create a new FarmMitra order</small>
          </button>

          <button
            className="action-card"
            onClick={() => router.push("/orders")}
          >
            <span className="action-icon">📦</span>
            <strong>My Orders</strong>
            <small>View your order history</small>
          </button>

          <button
            className="action-card"
            onClick={() => router.push("/profile")}
          >
            <span className="action-icon">👤</span>
            <strong>Shop Profile</strong>
            <small>Manage shop information</small>
          </button>
        </div>
      </section>
    </main>
  )
}