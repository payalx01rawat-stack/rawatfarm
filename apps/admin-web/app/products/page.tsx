"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:4000"
type Product = { id: string; name: string; sku: string; status: string; vendorName?: string | null; category?: { name: string }; price?: string | number | null }

export default function ProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  useEffect(() => { const token = localStorage.getItem("farmmitra_access_token"); fetch(`${API_URL}/api/v1/catalog/products`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data?.error || "Unable to load products"); setProducts(data) }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load products")).finally(() => setLoading(false)) }, [])

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
          <button className="nav-item active">□ Products</button>
          <button className="nav-item" onClick={() => router.push("/delivery")}>⌁ Delivery</button>
          <button className="nav-item" onClick={() => router.push("/reports")}>◫ Reports</button>
        </nav>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div>
            <h1>Products</h1>
            <p>Manage FarmMitra product catalog and pricing.</p>
          </div>
        </header>

        <div className="content">
          <section className="panel">
            {error && <div className="empty-state">{error}</div>}{loading ? <div className="empty-state">Loading products...</div> : products.length === 0 ? <div className="empty-state">No products found.</div> : <div className="table-wrap"><table><thead><tr><th>Product</th><th>Vendor</th><th>Category</th><th>Price</th><th>Status</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><span>{product.sku}</span></td><td>{product.vendorName || "Vendor"}</td><td>{product.category?.name || "-"}</td><td>INR {Number(product.price || 0).toLocaleString("en-IN")}</td><td>{product.status}</td></tr>)}</tbody></table></div>}
          </section>
        </div>
      </section>
    </main>
  )
}
