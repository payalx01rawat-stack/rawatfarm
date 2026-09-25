"use client"

import { useEffect, useState } from "react"
import { PortalShell, StateMessage } from "../../components/PortalShell"
import { api } from "../../lib/api"

type Product = { id: string; name: string; sku: string; stockQuantity?: string | number; stockStatus: string; lowStockThreshold: string | number; trackInventory: boolean }
type Identity = { vendor: { id: string } | null }
type Movement = { id: string; createdAt: string; productId: string; quantityDelta: string | number; stockBefore: string | number; stockAfter: string | number; reason: string; movementType: string; referenceId?: string | null }
const links = [{ label: "Dashboard", href: "/vendor/dashboard" }, { label: "Products", href: "/vendor/products" }, { label: "Inventory", href: "/vendor/inventory" }, { label: "Orders", href: "/vendor/orders" }]

export default function VendorInventory() {
  const [vendorId, setVendorId] = useState("")
  const [products, setProducts] = useState<Product[]>([])
  const [movements, setMovements] = useState<Movement[]>([])
  const [productId, setProductId] = useState("")
  const [quantity, setQuantity] = useState("1")
  const [direction, setDirection] = useState("INCREASE")
  const [reason, setReason] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function load() {
    setLoading(true)
    setError("")
    try {
      const identity = await api<Identity>("/api/v1/marketplace/me")
      if (!identity.vendor) throw new Error("Vendor access is not configured")
      setVendorId(identity.vendor.id)
      const inventory = await api<Product[]>(`/api/v1/marketplace/vendors/${identity.vendor.id}/products`)
      setProducts(inventory)
      if (!productId && inventory[0]) setProductId(inventory[0].id)
      const history = inventory[0] ? await api<{ movements: Movement[] }>(`/api/v1/marketplace/vendors/${identity.vendor.id}/products/${productId || inventory[0].id}/inventory`) : { movements: [] }
      setMovements(history.movements)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load inventory")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function adjust() {
    if (!productId || !reason.trim() || Number(quantity) <= 0) { setError("Select a product, enter a positive quantity, and provide a reason."); return }
    setSaving(true); setError("")
    try {
      await api(`/api/v1/marketplace/vendors/${vendorId}/products/${productId}/inventory`, { method: "PATCH", body: JSON.stringify({ quantity: Number(quantity), direction, reason: reason.trim() }) })
      setReason(""); setMessage("Stock adjustment saved"); await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to adjust stock") } finally { setSaving(false) }
  }

  return <PortalShell title="Vendor inventory" subtitle="Adjust stock with an auditable movement history." links={links}>
    {message && <StateMessage>{message}</StateMessage>}
    {error && <StateMessage error>{error}<br /><button onClick={load}>Try again</button></StateMessage>}
    {loading ? <section className="portal-panel"><StateMessage>Loading inventory...</StateMessage></section> : <div className="portal-grid"><section className="portal-panel"><h2>Adjust stock</h2><label>Product<select value={productId} onChange={(event) => setProductId(event.target.value)}>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label><label>Direction<select value={direction} onChange={(event) => setDirection(event.target.value)}><option value="INCREASE">Increase</option><option value="DECREASE">Decrease</option></select></label><label>Quantity<input type="number" min="0.001" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label><label>Reason<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="New supplier stock" /></label><button disabled={saving} onClick={adjust}>{saving ? "Saving..." : "Save adjustment"}</button></section><section className="portal-panel"><h2>Current stock</h2>{products.length === 0 ? <div className="portal-empty">No products found.</div> : <div className="table-wrap"><table className="portal-table"><thead><tr><th>Product</th><th>Stock</th><th>Status</th><th>Threshold</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>{product.sku}</small></td><td>{product.trackInventory ? product.stockQuantity : "Not tracked"}</td><td>{product.stockStatus}</td><td>{product.lowStockThreshold}</td></tr>)}</tbody></table></div>}</section><section className="portal-panel"><h2>Stock history</h2>{movements.length === 0 ? <div className="portal-empty">No movements recorded.</div> : <div className="table-wrap"><table className="portal-table"><thead><tr><th>Date</th><th>Movement</th><th>Change</th><th>Before → after</th><th>Reason</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td>{new Date(movement.createdAt).toLocaleString("en-IN")}</td><td>{movement.movementType}</td><td>{movement.quantityDelta}</td><td>{movement.stockBefore} → {movement.stockAfter}</td><td>{movement.reason}</td></tr>)}</tbody></table></div>}</section></div>}
  </PortalShell>
}
