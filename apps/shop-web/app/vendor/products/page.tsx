"use client"

import { useEffect, useState, type FormEvent } from "react"
import { MediaImage } from "../../components/MediaImage"
import { PortalShell, StateMessage } from "../../components/PortalShell"
import { api } from "../../lib/api"

type Product = { id: string; name: string; sku: string; status: string; imageUrl?: string | null; category: { name: string }; unit: { code: string }; prices?: { price: string | number }[] }
type Identity = { vendor: { id: string } | null }
type ProductOptions = { categories: { id: string; name: string }[]; units: { id: string; name: string; code: string }[] }
type ProductDraft = { name: string; sku: string; categoryId: string; unitId: string; description: string; initialStockQuantity: string }
const links = [{ label: "Dashboard", href: "/vendor/dashboard" }, { label: "Products", href: "/vendor/products" }, { label: "Inventory", href: "/vendor/inventory" }, { label: "Orders", href: "/vendor/orders" }]

export default function VendorProducts() {
  const [vendorId, setVendorId] = useState("")
  const [products, setProducts] = useState<Product[]>([])
  const [options, setOptions] = useState<ProductOptions>({ categories: [], units: [] })
  const [draft, setDraft] = useState<ProductDraft>({ name: "", sku: "", categoryId: "", unitId: "", description: "", initialStockQuantity: "0" })
  const [creating, setCreating] = useState(false)
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
      const [nextProducts, nextOptions] = await Promise.all([
        api<Product[]>(`/api/v1/marketplace/vendors/${identity.vendor.id}/products`),
        api<ProductOptions>(`/api/v1/marketplace/vendors/${identity.vendor.id}/product-options`),
      ])
      setProducts(nextProducts)
      setOptions(nextOptions)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load products")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (creating) return
    setCreating(true)
    setError("")
    try {
      const initialStockQuantity = Number(draft.initialStockQuantity)
      if (!Number.isFinite(initialStockQuantity) || initialStockQuantity < 0) throw new Error("Initial stock cannot be negative.")
      await api(`/api/v1/marketplace/vendors/${vendorId}/products`, {
        method: "POST",
        body: JSON.stringify({ ...draft, initialStockQuantity, description: draft.description || undefined }),
      })
      setDraft({ name: "", sku: "", categoryId: "", unitId: "", description: "", initialStockQuantity: "0" })
      setMessage("Product added to your catalogue")
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to add product")
    } finally {
      setCreating(false)
    }
  }

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
    {!loading && !error && <section className="portal-panel"><div className="panel-caption"><strong>Add a product</strong><span>An administrator must set the base rate before customers can order the product. Inventory is tracked for vendor products.</span></div><form className="portal-form" onSubmit={createProduct}><label>Product name<input required minLength={2} maxLength={191} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>SKU<input required maxLength={191} value={draft.sku} onChange={(event) => setDraft({ ...draft, sku: event.target.value })} /></label><label>Category<select required value={draft.categoryId} onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}><option value="">Choose category</option>{options.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Unit<select required value={draft.unitId} onChange={(event) => setDraft({ ...draft, unitId: event.target.value })}><option value="">Choose unit</option>{options.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.code})</option>)}</select></label><label>Initial stock ({options.units.find((unit) => unit.id === draft.unitId)?.code || "selected unit"})<input type="number" min="0" step="0.001" value={draft.initialStockQuantity} onChange={(event) => setDraft({ ...draft, initialStockQuantity: event.target.value })} /></label><label>Description<input maxLength={191} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><p className="muted">Tracked products with 0 stock are unavailable until replenished.</p><button type="submit" disabled={creating || options.categories.length === 0 || options.units.length === 0}>{creating ? "Adding..." : "Add product"}</button></form>{(options.categories.length === 0 || options.units.length === 0) && <StateMessage error>No active categories or units are configured. Ask an administrator to configure the catalogue.</StateMessage>}</section>}
    {loading ? <section className="portal-panel dashboard-loading"><StateMessage>Loading your catalogue...</StateMessage></section> : !error && <section className="portal-panel">
      <div className="panel-caption"><strong>{products.length} products</strong><span>Only products owned by this vendor are shown.</span></div>
      {products.length === 0 ? <div className="portal-empty"><strong>No products belong to this vendor.</strong><br />Add products through the existing catalogue workflow.</div> : <div className="table-wrap"><table className="portal-table">
        <thead><tr><th>Product</th><th>Category</th><th>Unit</th><th>Base rate</th><th>Status</th><th>Image</th><th>Actions</th></tr></thead>
        <tbody>{products.map((product) => <tr key={product.id}>
          <td><div className="product-row"><MediaImage src={product.imageUrl} alt={`${product.name} product image`} fallback={product.name.slice(0, 1)} /><span><strong>{product.name}</strong><small>{product.sku}</small></span></div></td>
          <td>{product.category.name}</td>
          <td>{product.unit.code}</td>
          <td>{product.prices?.[0]?.price == null ? "Awaiting admin rate" : `₹${Number(product.prices[0].price).toLocaleString("en-IN")} / ${product.unit.code}`}</td>
          <td><span className={`status-badge ${product.status !== "ACTIVE" ? "warn" : ""}`}>{product.status}</span></td>
          <td>{editingId === product.id ? <input value={imageDraft} onChange={(event) => setImageDraft(event.target.value)} placeholder="https://..." aria-label={`Image URL for ${product.name}`} /> : product.imageUrl ? <a href={product.imageUrl} target="_blank" rel="noreferrer">View image</a> : <span className="muted">Fallback shown</span>}</td>
          <td><div className="portal-actions">{editingId === product.id ? <><button onClick={() => saveImage(product)}>Save image</button><button className="secondary" onClick={() => setEditingId("")}>Cancel</button></> : <><button onClick={() => { setEditingId(product.id); setImageDraft(product.imageUrl || "") }}>Edit image</button><button onClick={() => toggle(product)}>{product.status === "ACTIVE" ? "Disable" : "Activate"}</button></>}</div></td>
        </tr>)}</tbody>
      </table></div>}
    </section>}
  </PortalShell>
}
