"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { PortalShell, StateMessage } from "../components/PortalShell"
import { customerApi, customerCatalogApi } from "../lib/customer-api"
import { cartTotal, readCart, writeCart, type CartItem } from "../lib/cart"

type Item = CartItem
type Product = { id: string; price?: string | number | null; availableForPurchase?: boolean; minOrderQuantity?: string | number | null; unit: { code: string } }
type Address = { id: string; label?: string | null; line1: string; line2?: string | null; city: string; state: string; postalCode: string }
const empty = { label: "Home", line1: "", line2: "", city: "", state: "", postalCode: "" }
const uniqueAddresses = (addresses: Address[]) => Array.from(new Map(addresses.map((address) => [`${address.label || "Address"}|${address.line1}|${address.line2 || ""}|${address.city}|${address.state}|${address.postalCode}`, address])).values())

export default function Checkout() {
  const router = useRouter()
  const [items, setItems] = useState<Item[]>([])
  const [addresses, setAddresses] = useState<Address[]>([])
  const [addressId, setAddressId] = useState("")
  const [form, setForm] = useState(empty)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [savingAddress, setSavingAddress] = useState(false)
  const [placingOrder, setPlacingOrder] = useState(false)
  const [idempotencyKey] = useState(() => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

  useEffect(() => {
    const cart = readCart()
    setItems(cart)
    Promise.all([
      customerApi<Address[]>("/api/v1/marketplace/addresses"),
      customerCatalogApi<Product[]>("/api/v1/marketplace/products"),
    ]).then(([savedAddresses, products]) => {
      const visibleAddresses = uniqueAddresses(savedAddresses)
      setAddresses(visibleAddresses)
      if (visibleAddresses[0]) setAddressId(visibleAddresses[0].id)
      const currentProducts = new Map(products.map((product) => [product.id, product]))
      const refreshedCart = cart.map((item) => {
        const product = currentProducts.get(item.id)
        return product
          ? { ...item, price: product.price, availableForPurchase: product.availableForPurchase !== false && product.price != null, minOrderQuantity: product.minOrderQuantity }
          : { ...item, price: null, availableForPurchase: false }
      })
      setItems(refreshedCart)
      writeCart(refreshedCart)
    }).catch((reason) => {
      setError(reason instanceof Error ? reason.message : "Unable to load checkout")
    }).finally(() => setLoading(false))
  }, [])

  const groups = useMemo(() => Array.from(items.reduce((map, item) => {
    const group = map.get(item.vendor.id) || { vendorId: item.vendor.id, vendor: item.vendor.name, items: [] as Item[] }
    group.items.push(item)
    map.set(item.vendor.id, group)
    return map
  }, new Map<string, { vendorId: string; vendor: string; items: Item[] }>()).values()), [items])
  const total = cartTotal(items)
  const unavailableItems = items.filter((item) => item.availableForPurchase === false || item.price == null || item.quantity < Number(item.minOrderQuantity || 1))

  function updateItems(next: Item[]) {
    setItems(next)
    writeCart(next)
  }

  async function saveAddress() {
    setError("")
    setSavingAddress(true)
    try {
      const address = await customerApi<Address>("/api/v1/marketplace/addresses", { method: "POST", body: JSON.stringify(form) })
      setAddresses((current) => uniqueAddresses([address, ...current]))
      setAddressId(address.id)
      setForm(empty)
      setMessage("Address saved")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save address")
    } finally {
      setSavingAddress(false)
    }
  }

  async function placeOrder() {
    if (!addressId) {
      setError("Select or save a delivery address before placing the order.")
      return
    }
    if (unavailableItems.length) {
      setError("One or more cart items have no current price or do not meet the minimum order quantity. Update your cart before placing the order.")
      return
    }
    if (placingOrder) return
    setError("")
    setPlacingOrder(true)
    try {
      const order = await customerApi<{ id: string }>("/api/v1/marketplace/orders", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ addressId, items: items.map((item) => ({ productId: item.id, quantity: item.quantity })) }),
      })
      writeCart([])
      router.push(`/orders/${order.id}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to place order")
      setPlacingOrder(false)
    }
  }

  return <PortalShell title="Checkout" subtitle="One order, separated safely by vendor." links={[{ label: "Marketplace", href: "/" }, { label: "My orders", href: "/orders" }]}>
    {message && <StateMessage>{message}</StateMessage>}
    {error && <StateMessage error>{error}<br /><a href="/customer/login">Sign in to continue</a></StateMessage>}
    {loading ? <section className="portal-panel"><StateMessage>Loading checkout...</StateMessage></section> : items.length === 0 ? <section className="portal-panel"><div className="portal-empty">Your cart is empty. Return to the marketplace to add products.</div><button className="secondary" onClick={() => router.push("/")}>Browse marketplace</button></section> : <div className="portal-grid">
      <section className="portal-panel">
        <h2>Delivery address</h2>
        {addresses.length > 0 && <select value={addressId} onChange={(event) => setAddressId(event.target.value)}><option value="">Select saved address</option>{addresses.map((address) => <option key={address.id} value={address.id}>{address.label || "Address"} · {address.line1}, {address.city}</option>)}</select>}
        <div className="portal-form">
          <label>Label<input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></label>
          <label>Address line<input value={form.line1} onChange={(event) => setForm({ ...form, line1: event.target.value })} /></label>
          <label>City<input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label>
          <label>State<input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} /></label>
          <label>Postal code<input value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} /></label>
          <button disabled={savingAddress} onClick={saveAddress}>{savingAddress ? "Saving..." : "Save address"}</button>
        </div>
      </section>
      <section className="portal-panel">
        <h2>Order summary</h2>
        {groups.map((group) => <div key={group.vendorId} className="cart-items"><strong>{group.vendor}</strong>{group.items.map((item) => <div className="cart-item" key={item.id}>
          <div>{item.name}<small>{item.quantity} × {item.price == null ? "Price unavailable" : `₹${Number(item.price).toLocaleString("en-IN")} / ${item.unit.code}`}</small>{item.quantity < Number(item.minOrderQuantity || 1) && <small>Minimum: {item.minOrderQuantity} {item.unit.code}</small>}</div>
          <strong>{item.price == null ? "Unavailable" : `₹${(Number(item.price) * item.quantity).toLocaleString("en-IN")}`}</strong>
        </div>)}</div>)}
        <div className="cart-total"><span>Total</span><strong>₹{total.toLocaleString("en-IN")}</strong></div>
        <button className="checkout-button" disabled={!addressId || placingOrder || unavailableItems.length > 0} onClick={placeOrder}>{placingOrder ? "Placing order..." : "Place order"}</button>
      </section>
    </div>}
  </PortalShell>
}
