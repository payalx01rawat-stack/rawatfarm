"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminSidebar } from "../components/AdminSidebar"
import { clearAdminSession, fetchAdminJson, formatCurrency } from "../lib/admin-api"

type Option = { id: string; name: string; code?: string }
type Product = {
  id: string
  vendorId?: string | null
  name: string
  sku: string
  description?: string | null
  imageUrl?: string | null
  status: string
  categoryId: string
  unitId: string
  category?: { name: string }
  unit?: { name: string; code: string }
  price?: string | number | null
  minOrderQuantity?: string | number | null
  stockQuantity?: string | number
  lowStockThreshold?: string | number
  trackInventory?: boolean
  stockStatus?: string
}
type ProductForm = { name: string; categoryId: string; unitId: string; price: string; minOrderQuantity: string; initialStockQuantity: string; status: string; imageUrl: string; trackInventory: boolean }
const emptyForm: ProductForm = { name: "", categoryId: "", unitId: "", price: "", minOrderQuantity: "", initialStockQuantity: "0", status: "ACTIVE", imageUrl: "", trackInventory: true }

function generatedSku() {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replaceAll("-", "").slice(0, 12) : `${Date.now()}${Math.random().toString(36).slice(2, 8)}`
  return `RF-${suffix.toUpperCase()}`
}

export function ProductManagementPage({ childAdmin = false }: { childAdmin?: boolean } = {}) {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Option[]>([])
  const [units, setUnits] = useState<Option[]>([])
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [editing, setEditing] = useState<Product | null>(null)
  const [stockProduct, setStockProduct] = useState<Product | null>(null)
  const [stockQuantity, setStockQuantity] = useState("1")
  const [stockReason, setStockReason] = useState("")
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<ProductForm>(emptyForm)
  const [childAdminPermissions, setChildAdminPermissions] = useState<string[]>([])

  useEffect(() => {
    if (!childAdmin) return
    try {
      const user = JSON.parse(localStorage.getItem("farmmitra_user") || "null") as { childAdminPermissions?: unknown } | null
      if (Array.isArray(user?.childAdminPermissions)) {
        setChildAdminPermissions(user.childAdminPermissions.filter((permission): permission is string => typeof permission === "string"))
      }
    } catch {
      setChildAdminPermissions([])
    }
  }, [childAdmin])

  async function load() {
    setLoading(true)
    setError("")
    try {
      const [productData, categoryData, unitData] = await Promise.all([
        fetchAdminJson<Product[]>("/api/v1/catalog/products?business=rawat-farm"),
        fetchAdminJson<Option[]>("/api/v1/catalog/categories"),
        fetchAdminJson<Option[]>("/api/v1/catalog/units"),
      ])
      setProducts(productData)
      setCategories(categoryData.filter((option) => (option as Option & { isActive?: boolean }).isActive !== false))
      setUnits(unitData.filter((option) => (option as Option & { isActive?: boolean }).isActive !== false))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load Rawat Farm products")
      if (reason instanceof Error && reason.message.includes("session")) {
        clearAdminSession()
        router.push("/")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const visible = useMemo(() => products.filter((product) => {
    const haystack = `${product.name} ${product.sku} ${product.category?.name || ""}`.toLowerCase()
    return (!search || haystack.includes(search.toLowerCase().trim()))
      && (!status || product.status === status)
  }), [products, search, status])
  const canReadPrices = !childAdmin || childAdminPermissions.includes("catalog.prices.read")
  const canWriteCurrentPrice = !childAdmin || childAdminPermissions.includes(editing ? "catalog.prices.update" : "catalog.prices.create")

  function startNew() {
    setEditing(null)
    setFormOpen(true)
    setForm({ ...emptyForm, categoryId: categories[0]?.id || "", unitId: units[0]?.id || "" })
    setError("")
    setMessage("")
  }

  function startEdit(product: Product) {
    setEditing(product)
    setFormOpen(true)
    setForm({
      name: product.name,
      categoryId: product.categoryId,
      unitId: product.unitId,
      price: product.price == null ? "" : String(product.price),
      minOrderQuantity: product.minOrderQuantity == null ? "" : String(product.minOrderQuantity),
      initialStockQuantity: "0",
      status: product.status,
      imageUrl: product.imageUrl || "",
      trackInventory: product.trackInventory ?? true,
    })
    setError("")
    setMessage("")
  }

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError("")
    setMessage("")
    try {
      const price = Number(form.price)
      const minimum = form.minOrderQuantity.trim() ? Number(form.minOrderQuantity) : undefined
      if (canWriteCurrentPrice && (!Number.isFinite(price) || price <= 0)) throw new Error("Enter a product price greater than zero.")
      if (minimum !== undefined && (!Number.isFinite(minimum) || minimum < 0)) throw new Error("Minimum order quantity cannot be negative.")
      const initialStockQuantity = Number(form.initialStockQuantity)
      if (!childAdmin && !editing && (!Number.isFinite(initialStockQuantity) || initialStockQuantity < 0)) throw new Error("Initial stock cannot be negative.")
      if (!childAdmin && !editing && !form.trackInventory && initialStockQuantity > 0) throw new Error("Initial stock must be zero when inventory tracking is disabled.")
      const fields = {
        name: form.name.trim(),
        categoryId: form.categoryId,
        unitId: form.unitId,
        ...(canWriteCurrentPrice ? { price } : {}),
        ...(minimum !== undefined ? { minOrderQuantity: minimum } : editing ? { minOrderQuantity: null } : {}),
        status: form.status,
        imageUrl: form.imageUrl.trim() || null,
        ...(!childAdmin ? { trackInventory: form.trackInventory, ...(!editing ? { initialStockQuantity } : {}) } : {}),
      }
      if (editing) {
        await fetchAdminJson(`/api/v1/catalog/products/${editing.id}`, { method: "PATCH", body: JSON.stringify(fields) })
        setMessage("Product and current price updated. Previous order prices remain unchanged.")
      } else {
        await fetchAdminJson("/api/v1/catalog/products", {
          method: "POST",
          body: JSON.stringify({ ...fields, sku: generatedSku() }),
        })
        setMessage("Product added to the Rawat Farm catalog.")
      }
      setEditing(null)
      setFormOpen(false)
      setForm(emptyForm)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save product")
    } finally {
      setSaving(false)
    }
  }

  async function replenishStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!stockProduct?.vendorId) {
      setError("This product is not linked to a vendor, so its stock cannot be adjusted here.")
      return
    }
    const quantity = Number(stockQuantity)
    if (!Number.isFinite(quantity) || quantity <= 0 || !stockReason.trim()) {
      setError("Enter a positive replenishment quantity and a reason.")
      return
    }
    setSaving(true)
    setError("")
    setMessage("")
    try {
      await fetchAdminJson(`/api/v1/marketplace/vendors/${stockProduct.vendorId}/products/${stockProduct.id}/inventory`, {
        method: "PATCH",
        body: JSON.stringify({ quantity, direction: "INCREASE", reason: stockReason.trim() }),
      })
      setMessage(`Added ${quantity} ${stockProduct.unit?.code || "units"} to ${stockProduct.name}; stock history was recorded.`)
      setStockProduct(null)
      setStockQuantity("1")
      setStockReason("")
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to replenish product stock")
    } finally {
      setSaving(false)
    }
  }

  async function updateProductStatus(product: Product) {
    const status = product.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
    setSaving(true)
    setError("")
    setMessage("")
    try {
      await fetchAdminJson(`/api/v1/catalog/products/${encodeURIComponent(product.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      })
      setMessage(`${product.name} ${status === "ACTIVE" ? "activated" : "deactivated"}.`)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update product status")
    } finally {
      setSaving(false)
    }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Delete ${product.name}? Products linked to order history will be kept as inactive.`)) return
    setSaving(true)
    setError("")
    setMessage("")
    try {
      await fetchAdminJson(`/api/v1/catalog/products/${encodeURIComponent(product.id)}`, { method: "DELETE" })
      setMessage(`${product.name} was removed from the active catalog. Historical orders are unchanged.`)
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to delete product")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="app-shell">
      <AdminSidebar />
      <section className="main-content">
        <header className="topbar">
          <div><h1>Products</h1><p>Rawat Farm product catalog and pricing</p></div>
          <button className="top-logout" onClick={() => { clearAdminSession(); router.push("/") }}>Logout</button>
        </header>
        <div className="content">
          <section className="panel">
            <div className="panel-header">
              <div><h3>Product list</h3><p>Manage product details, price, order quantity, and availability.</p></div>
              <button className="primary-action" onClick={startNew}>Add Product</button>
            </div>
            {(error || message) && <div className={error ? "message error" : "success-message"} role={error ? "alert" : "status"}>{error || message}{error && !formOpen && <button className="secondary-action" onClick={() => void load()}>Reload product list</button>}</div>}
            {formOpen && (
              <form className="product-form" onSubmit={saveProduct}>
                <div className="product-form-heading"><h3>{editing ? "Edit Product" : "Add Product"}</h3>{editing && <span>{editing.sku}</span>}</div>
                <div className="form-grid">
                  <label>Product name<input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
                  <label>Category<select required value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}><option value="" disabled>Select category</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
                  <label>Unit<select required value={form.unitId} onChange={(event) => setForm({ ...form, unitId: event.target.value })}><option value="" disabled>Select unit</option>{units.map((unit) => <option value={unit.id} key={unit.id}>{unit.name}{unit.code ? ` (${unit.code})` : ""}</option>)}</select></label>
                  {canWriteCurrentPrice
                    ? <label>Price (₹)<input required type="number" min="0.01" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label>
                    : canReadPrices && editing
                      ? <p>Current base rate: {editing.price == null ? "Not set" : formatCurrency(editing.price)}</p>
                      : null}
                  <label>Minimum order quantity<input type="number" min="0" step="0.001" value={form.minOrderQuantity} onChange={(event) => setForm({ ...form, minOrderQuantity: event.target.value })} /></label>
                  {!childAdmin && !editing && <label>Initial stock ({units.find((unit) => unit.id === form.unitId)?.code || "selected unit"})<input type="number" min="0" step="0.001" value={form.initialStockQuantity} disabled={!form.trackInventory} onChange={(event) => setForm({ ...form, initialStockQuantity: event.target.value })} /></label>}
                  <label>Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
                  {!childAdmin && <label><input type="checkbox" checked={form.trackInventory} onChange={(event) => setForm({ ...form, trackInventory: event.target.checked, ...(!event.target.checked ? { initialStockQuantity: "0" } : {}) })} /> Track inventory</label>}
                  <label>Image URL (optional)<input type="url" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://..." /></label>
                </div>
                {!childAdmin && !editing && <p className="muted">{form.trackInventory ? "Tracked products with 0 stock are unavailable until replenished." : "Inventory tracking is off; stock is not checked during ordering."}</p>}
                <div className="product-form-actions"><button className="primary-action" disabled={saving || loading || !categories.length || !units.length}>{saving ? "Saving..." : editing ? "Save changes" : "Add Product"}</button><button type="button" className="secondary-action" onClick={() => { setEditing(null); setFormOpen(false); setForm(emptyForm); setError("") }}>Cancel</button></div>
              </form>
            )}
            {stockProduct && (
              <form className="product-form" onSubmit={replenishStock}>
                <div className="product-form-heading"><h3>Replenish stock</h3><span>{stockProduct.name} · {stockProduct.stockQuantity ?? 0} {stockProduct.unit?.code || ""} currently</span></div>
                <div className="form-grid">
                  <label>Quantity to add ({stockProduct.unit?.code || "units"})<input required type="number" min="0.001" step="0.001" value={stockQuantity} onChange={(event) => setStockQuantity(event.target.value)} /></label>
                  <label>Reason<input required maxLength={191} value={stockReason} onChange={(event) => setStockReason(event.target.value)} placeholder="Opening stock / supplier receipt" /></label>
                </div>
                <div className="product-form-actions"><button className="primary-action" disabled={saving}>{saving ? "Saving..." : "Add stock"}</button><button type="button" className="secondary-action" onClick={() => setStockProduct(null)}>Cancel</button></div>
              </form>
            )}
            <div className="vendor-filters">
              <label>Search products<input aria-label="Search products" placeholder="Search product or SKU" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
              <label>Product status<select aria-label="Filter product status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All product states</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
            </div>
            {loading ? <div className="empty-state">Loading products...</div> : visible.length === 0 ? <div className="empty-state">No products match these filters.</div> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Product</th><th>Category</th><th>Unit</th>{canReadPrices && <th>Price</th>}<th>Minimum order</th>{!childAdmin && <th>Stock</th>}<th>Status</th><th>Actions</th></tr></thead>
                <tbody>{visible.map((product) => <tr key={product.id}>
                  <td><strong>{product.name}</strong><span>{product.sku}</span>{product.imageUrl && <small>Image configured</small>}</td>
                  <td>{product.category?.name || "—"}</td>
                  <td>{product.unit?.name || product.unit?.code || "—"}</td>
                  {canReadPrices && <td><strong>{product.price == null ? "—" : formatCurrency(product.price)}</strong></td>}
                  <td>{product.minOrderQuantity ?? "—"}</td>
                  {!childAdmin && <td>{product.trackInventory ? product.stockQuantity : "Not tracked"}</td>}
                  <td><span className={`status ${product.status.toLowerCase()}`}>{product.status}</span></td>
                  <td><button className="secondary-action" disabled={saving} onClick={() => startEdit(product)}>Edit / Update price</button> <button className="secondary-action" disabled={saving} onClick={() => void updateProductStatus(product)}>{product.status === "ACTIVE" ? "Deactivate" : "Activate"}</button> {!childAdmin && <button className="secondary-action" disabled={!product.trackInventory || !product.vendorId || saving} onClick={() => { setStockProduct(product); setStockQuantity("1"); setStockReason("") }}>Add stock</button>} <button className="secondary-action" disabled={saving} onClick={() => void deleteProduct(product)}>Delete</button></td>
                </tr>)}</tbody>
              </table></div>
            )}
          </section>
        </div>
      </section>
    </main>
  )
}

export default ProductManagementPage
