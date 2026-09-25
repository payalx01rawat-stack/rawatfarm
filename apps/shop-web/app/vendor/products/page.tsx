"use client"

import { useEffect, useState } from "react"
import { MediaImage } from "../../components/MediaImage"
import { PortalShell, StateMessage } from "../../components/PortalShell"
import { api } from "../../lib/api"

type Product = { id: string; name: string; sku: string; status: string; imageUrl?: string | null; category: { name: string }; unit: { code: string }; prices?: { price: string | number }[] }
type Identity = { vendor: { id: string } | null }
const links = [{ label: "Dashboard", href: "/vendor/dashboard" }, { label: "Products", href: "/vendor/products" }, { label: "Orders", href: "/vendor/orders" }]

export default function VendorProducts() {
  const [vendorId, setVendorId] = useState("")
  const [products, setProducts] = useState<Product[]>([])
  const [editingId, setEditingId] = useState("")
  const [imageDraft, setImageDraft] = useState("")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function load() {
    setLoading(true)
    setError("")
    try {
      const identity = await api<Identity>("/api/v1/marketplace/me")
      if (!identity.vendor) throw new Error("Vendor access is not configured")
      setVendorId(identity.vendor.id)
      setProducts(await api<Product[]>(`/api/v1/marketplace/vendors/${identity.vendor.id}/products`))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load products")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function toggle(product: Product) {
    setError("")
    try { await api(`/api/v1/marketplace/vendors/${vendorId}/products/${product.id}`, { method: "PATCH", body: JSON.stringify({ status: product.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }) }); setMessage("Product status updated"); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update product") }
  }

  async function saveImage(product: Product) {
    setError("")
    try { await api(`/api/v1/marketplace/vendors/${vendorId}/products/${product.id}`, { method: "PATCH", body: JSON.stringify({ imageUrl: imageDraft.trim() || null }) }); setEditingId(""); setMessage("Product image URL saved"); await load() }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update product image") }
  }

  return <PortalShell title="Vendor products" subtitle="Manage catalogue availability and product image URLs." links={links}>
    {message && <StateMessage>{message}</StateMessage>}
    {error && <StateMessage error>{error}<br /><button onClick={load}>Try again</button></StateMessage>}
    {loading ? <section className="portal-panel dashboard-loading"><StateMessage>Loading your catalogue...</StateMessage></section> : !error && <section className="portal-panel"><div className="panel-caption"><strong>{products.length} products</strong><span>Only products owned by this vendor are shown.</span></div>{products.length === 0 ? <div className="portal-empty"><strong>No products belong to this vendor.</strong><br />Add products through the existing catalogue workflow.</div> : <div className="table-wrap"><table className="portal-table"><thead><tr><th>Product</th><th>Category</th><th>Unit</th><th>Price</th><th>Status</th><th>Image</th><th>Actions</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><div className="product-row"><MediaImage src={product.imageUrl} alt={`${product.name} product image`} fallback={product.name.slice(0, 1)} /><span><strong>{product.name}</strong><small>{product.sku}</small></span></div></td><td>{product.category.name}</td><td>{product.unit.code}</td><td>₹{Number(product.prices?.[0]?.price || 0).toLocaleString("en-IN")}</td><td><span className={`status-badge ${product.status !== "ACTIVE" ? "warn" : ""}`}>{product.status}</span></td><td>{editingId === product.id ? <input value={imageDraft} onChange={(event) => setImageDraft(event.target.value)} placeholder="https://..." aria-label={`Image URL for ${product.name}`} /> : product.imageUrl ? <a href={product.imageUrl} target="_blank" rel="noreferrer">View image</a> : <span className="muted">Fallback shown</span>}</td><td><div className="portal-actions">{editingId === product.id ? <><button onClick={() => saveImage(product)}>Save image</button><button className="secondary" onClick={() => setEditingId("")}>Cancel</button></> : <><button onClick={() => { setEditingId(product.id); setImageDraft(product.imageUrl || "") }}>Edit image</button><button onClick={() => toggle(product)}>{product.status === "ACTIVE" ? "Disable" : "Activate"}</button></>}</div></td></tr>)}</tbody></table></div>}</section>}
+  </PortalShell>
}
