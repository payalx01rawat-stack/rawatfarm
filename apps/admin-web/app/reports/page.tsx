"use client"

import { useRouter } from "next/navigation"

export default function ReportsPage() {
  const router = useRouter()

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
          <button className="nav-item" onClick={() => router.push("/dashboard")}>▦ Dashboard</button>
          <button className="nav-item" onClick={() => router.push("/orders")}>▤ Orders</button>
          <button className="nav-item" onClick={() => router.push("/shops")}>◉ Shops</button>
          <button className="nav-item" onClick={() => router.push("/products")}>□ Products</button>
          <button className="nav-item" onClick={() => router.push("/delivery")}>⌁ Delivery</button>
          <button className="nav-item active">◫ Reports</button>
        </nav>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div>
            <h1>Reports</h1>
            <p>Business performance and operational reports.</p>
          </div>
        </header>

        <div className="content">
          <section className="stats-grid">
            <div className="stat-card">
              <div>
                <span>Sales Report</span>
                <strong>Coming soon</strong>
              </div>
            </div>

            <div className="stat-card">
              <div>
                <span>Order Report</span>
                <strong>Coming soon</strong>
              </div>
            </div>

            <div className="stat-card">
              <div>
                <span>Delivery Report</span>
                <strong>Coming soon</strong>
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
