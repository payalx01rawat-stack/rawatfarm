"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:4000"
type Variant = { id: string; name: string; sku: string; stockQuantity?: string | number; lowStockThreshold: string | number; trackInventory: boolean; stockStatus: string }
type Product = { id: string; name: string; sku: string; status: string; vendorName?: string | null; category?: { name: string }; price?: string | number | null; stockQuantity?: string | number; lowStockThreshold: string | number; trackInventory: boolean; stockStatus: string; variants: Variant[] }

export default function ProductsPage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState("")
  const [vendor, setVendor] = useState("")
  const [status, setStatus] = useState("")
  const [stockStatus, setStockStatus] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const load = async () => {
    setLoading(true); setError("")
    try {
      const token = localStorage.getItem("farmmitra_access_token")
      const response = await fetch(`${API_URL}/api/v1/catalog/products`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || "Unable to load inventory")
      setProducts(data)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load inventory") } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  const vendors = useMemo(() => Array.from(new Set(products.map((product) => product.vendorName).filter(Boolean))), [products])
  const visible = products.filter((product) => {
    const haystack = `${product.name} ${product.sku} ${product.vendorName || ""}`.toLowerCase()
    return (!search || haystack.includes(search.toLowerCase())) && (!vendor || product.vendorName === vendor) && (!status || product.status === status) && (!stockStatus || product.stockStatus === stockStatus)
  })

  return <main className="app-shell"><aside className="sidebar"><div className="sidebar-brand"><div className="logo">FM</div><div><strong>FarmMitra</strong><span>Admin Portal</span></div></div><nav className="sidebar-nav"><button className="nav-item" onClick={() => router.push("/dashboard")}>▦ Dashboard</button><button className="nav-item" onClick={() => router.push("/orders")}>▤ Orders</button><button className="nav-item" onClick={() => router.push("/shops")}>◉ Shops</button><button className="nav-item active">□ Products</button><button className="nav-item" onClick={() => router.push("/delivery")}>⌁ Delivery</button><button className="nav-item" onClick={() => router.push("/reports")}>◫ Reports</button></nav></aside><section className="main-content"><header className="topbar"><div><h1>Products and inventory</h1><p>View vendor-owned stock without bypassing the inventory ledger.</p></div></header><div className="content"><section className="panel"><div className="filters"><input aria-label="Search products" placeholder="Search product or SKU" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Filter vendor" value={vendor} onChange={(event) => setVendor(event.target.value)}><option value="">All vendors</option>{vendors.map((item) => <option key={item} value={item}>{item}</option>)}</select><select aria-label="Filter product status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All product states</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select><select aria-label="Filter stock status" value={stockStatus} onChange={(event) => setStockStatus(event.target.value)}><option value="">All stock states</option><option value="IN_STOCK">In stock</option><option value="LOW_STOCK">Low stock</option><option value="OUT_OF_STOCK">Out of stock</option><option value="NOT_TRACKED">Not tracked</option></select></div>{error && <div className="empty-state" role="alert">{error} <button onClick={load}>Try again</button></div>}{loading ? <div className="empty-state">Loading inventory...</div> : visible.length === 0 ? <div className="empty-state">No products match these filters.</div> : <div className="table-wrap"><table><thead><tr><th>Product</th><th>Vendor</th><th>Stock</th><th>Threshold</th><th>Tracking</th><th>Stock status</th><th>Product status</th></tr></thead><tbody>{visible.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><span>{product.sku}</span>{product.variants.map((variant) => <small key={variant.id}>{variant.name} · {variant.stockStatus}</small>)}</td><td>{product.vendorName || "-"}</td><td>{product.trackInventory ? product.stockQuantity : "-"}</td><td>{product.lowStockThreshold}</td><td>{product.trackInventory ? "Tracked" : "Not tracked"}</td><td>{product.stockStatus}</td><td>{product.status}</td></tr>)}</tbody></table></div>}</section></div></section></main>
}
