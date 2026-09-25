"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { MediaImage } from "./components/MediaImage"
import { cartTotal, readCart, updateCartQuantity, writeCart, type CartItem } from "./lib/cart"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:4000"

type Product = {
  id: string
  name: string
  description?: string | null
  imageUrl?: string | null
  price?: string | number | null
  unit: { code: string }
  vendor: { id: string; name: string; imageUrl?: string | null }
  category: { id: string; name: string }
}

export default function Home() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>(() => readCart())
  const [search, setSearch] = useState("")
  const [vendorFilter, setVendorFilter] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [sort, setSort] = useState("name")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function loadProducts() {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/marketplace/products`)
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || "Unable to load products")
      setProducts(data)
    } catch (reason) {
      setProducts([])
      setError(reason instanceof Error ? reason.message : "Unable to load products")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProducts()
  }, [])

  useEffect(() => {
    writeCart(cart)
  }, [cart])

  /* Keep filtering local so changing one control never leaves an old result set on screen. */
  const filteredProducts = useMemo(() => products.filter((product) => {
    const needle = search.toLowerCase().trim()
    return (!needle || `${product.name} ${product.vendor.name} ${product.category.name}`.toLowerCase().includes(needle))
      && (!vendorFilter || product.vendor.id === vendorFilter)
      && (!categoryFilter || product.category.id === categoryFilter)
  }).sort((left, right) => {
    if (sort === "price-low") return Number(left.price || 0) - Number(right.price || 0)
    if (sort === "price-high") return Number(right.price || 0) - Number(left.price || 0)
    if (sort === "vendor") return left.vendor.name.localeCompare(right.vendor.name)
    return left.name.localeCompare(right.name)
  }), [products, search, vendorFilter, categoryFilter, sort])

  const vendors = useMemo(() => Array.from(new Map(products.map((product) => [product.vendor.id, product.vendor])).values()), [products])
  const categories = useMemo(() => Array.from(new Map(products.map((product) => [product.category.id, product.category])).values()), [products])

  const total = cartTotal(cart)
  const cartItemCount = cart.reduce((count, item) => count + item.quantity, 0)

  function addToCart(product: Product) {
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id)
      if (existing) return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
      return [...current, { ...product, quantity: 1 }]
    })
    setMessage(`${product.name} added to cart.`)
  }

  function removeFromCart(id: string) {
    setCart((current) => current.filter((item) => item.id !== id))
  }

  return (
    <main className="marketplace">
      <header className="market-header">
        <button className="market-brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="FarmMitra marketplace home"><span className="market-logo">FM</span><span><strong>FarmMitra</strong><small>Fresh from trusted local vendors</small></span></button>
        <label className="market-search"><span>Search the market</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chicken, mutton, eggs..." aria-label="Search products, vendors, or categories" /></label>
        <div className="market-nav"><button className="market-link" onClick={() => router.push("/orders")}>My orders</button><button className="cart-pill" onClick={() => router.push("/checkout")} aria-label={`Open cart with ${cartItemCount} items`}>Cart <strong>{cartItemCount}</strong> <span>₹{total.toLocaleString("en-IN")}</span></button></div>
      </header>
      <section className="market-intro"><div><p className="market-kicker">ONE MARKETPLACE. MANY TRUSTED VENDORS.</p><h1>Good food, sourced close to home.</h1><p>Shop fresh meat, poultry, fish and farm essentials from verified FarmMitra vendors.</p></div><div className="intro-mark">FRESH<br />DAILY</div></section>
      <section className="market-layout">
        <div className="catalog-area"><div className="section-heading"><div><p className="market-kicker">SHOP THE MARKET</p><h2>Popular today</h2></div><span>{loading ? "Loading" : `${filteredProducts.length} products`}</span></div>
          <div className="market-filters"><label>Vendor<select value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)}><option value="">All vendors</option>{vendors.map((vendor) => <option value={vendor.id} key={vendor.id}>{vendor.name}</option>)}</select></label><label>Category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">Name</option><option value="vendor">Vendor</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label>{(search || vendorFilter || categoryFilter || sort !== "name") && <button className="clear-filters" onClick={() => { setSearch(""); setVendorFilter(""); setCategoryFilter(""); setSort("name") }}>Clear filters</button>}</div>
          {error && <div className="market-message error" role="alert">{error}<br /><button onClick={loadProducts}>Try again</button></div>}
          {message && !error && <div className="market-message" role="status">{message}</div>}
          {loading ? <div className="product-grid" aria-label="Loading products"><div className="product-card skeleton" /><div className="product-card skeleton" /><div className="product-card skeleton" /></div> : !error && filteredProducts.length === 0 ? <div className="market-empty"><strong>No products match those filters.</strong><br />Try another search or clear the filters to browse the full market.</div> : <div className="product-grid">{filteredProducts.map((product) => <article className="product-card" key={product.id} onClick={() => router.push(`/products/${product.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") router.push(`/products/${product.id}`) }} tabIndex={0} role="link" aria-label={`View ${product.name} from ${product.vendor.name}`}>
            <div className="product-image"><MediaImage src={product.imageUrl} alt={product.name} fallback={product.name.slice(0, 1)} /></div>
            <div className="product-body"><p className="vendor-name">Sold by {product.vendor.name}</p><h3>{product.name}</h3><p className="product-description">{product.description || "Quality checked and packed fresh."}</p><div className="product-footer"><strong>₹{Number(product.price || 0).toLocaleString("en-IN")} <small>/ {product.unit.code}</small></strong><button onClick={(event) => { event.stopPropagation(); addToCart(product) }} aria-label={`Add ${product.name} to cart`}>Add</button></div></div>
          </article>)}</div>}
        </div>
        <aside className="cart-panel"><div className="cart-heading"><h2>Your cart</h2><span>{cartItemCount} items</span></div>{cart.length === 0 ? <div className="cart-empty"><span>+</span><p>Your cart is waiting for something fresh.</p><button className="cart-browse" onClick={() => document.querySelector(".product-grid")?.scrollIntoView({ behavior: "smooth" })}>Browse products</button></div> : <><div className="cart-items">{cart.map((item) => <div className="cart-item" key={item.id}><div><strong>{item.name}</strong><small>{item.vendor.name}</small><div className="quantity-control"><button onClick={() => setCart((current) => updateCartQuantity(current, item.id, item.quantity - 1))} aria-label={`Decrease ${item.name}`}>−</button><span>{item.quantity}</span><button onClick={() => setCart((current) => updateCartQuantity(current, item.id, item.quantity + 1))} aria-label={`Increase ${item.name}`}>+</button><em>₹{(Number(item.price || 0) * item.quantity).toLocaleString("en-IN")}</em></div></div><button onClick={() => removeFromCart(item.id)} aria-label={`Remove ${item.name}`}>×</button></div>)}</div><div className="cart-total"><span>Total</span><strong>₹{total.toLocaleString("en-IN")}</strong></div><button className="checkout-button" onClick={() => router.push("/checkout")}>Checkout</button></>}</aside>
      </section>
    </main>
  )
}
