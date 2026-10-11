"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useLanguage, useTranslation } from "@farmmitra/shared-utils/src/LanguageProvider"
import { MediaImage } from "./components/MediaImage"
import { cartTotal, readCart, updateCartQuantity, writeCart, type CartItem } from "./lib/cart"
import { clearShopSession, readCustomerSession, type CustomerSessionUser } from "./lib/customer-session"
import { customerCatalogApi } from "./lib/customer-api"

type Product = {
  id: string
  name: string
  description?: string | null
  imageUrl?: string | null
  price?: string | number | null
  availableForPurchase?: boolean
  minOrderQuantity?: string | number | null
  unit: { code: string }
  vendor: { id: string; name: string; imageUrl?: string | null }
  category: { id: string; name: string }
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "NOT_TRACKED"
}

export default function Home() {
  const router = useRouter()
  const { language } = useLanguage()
  const { t } = useTranslation()
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartHydrated, setCartHydrated] = useState(false)
  const [customer, setCustomer] = useState<CustomerSessionUser | null>(null)
  const [sessionHydrated, setSessionHydrated] = useState(false)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("")
  const [sort, setSort] = useState("name")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function loadProducts() {
    setLoading(true)
    setError("")
    try {
      const data = await customerCatalogApi<Product[]>("/api/v1/marketplace/products")
      setProducts(data.map((product: Product) => ({ ...product, description: product.description?.replace(/Vendor [A-Z]/g, "Rawat Farm"), vendor: { id: "rawat-farm", name: "Rawat Farm" } })))
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
    setCart(readCart().map((item) => ({ ...item, vendor: { ...item.vendor, name: "Rawat Farm" } })))
    setCartHydrated(true)
  }, [])

  useEffect(() => {
    setCustomer(readCustomerSession())
    setSessionHydrated(true)
  }, [])

  useEffect(() => {
    if (!cartHydrated) return
    writeCart(cart)
  }, [cart, cartHydrated])

  useEffect(() => {
    if (!cartHydrated || products.length === 0) return
    const currentProducts = new Map(products.map((product) => [product.id, product]))
    setCart((current) => current.map((item) => {
      const currentProduct = currentProducts.get(item.id)
      return currentProduct
        ? { ...item, price: currentProduct.price, availableForPurchase: currentProduct.availableForPurchase }
        : { ...item, price: null, availableForPurchase: false }
    }))
  }, [products, cartHydrated])

  /* Keep filtering local so changing one control never leaves an old result set on screen. */
  const filteredProducts = useMemo(() => products.filter((product) => {
    const needle = search.toLowerCase().trim()
    return (!needle || `${product.name} ${product.category.name}`.toLowerCase().includes(needle))
      && (!categoryFilter || product.category.id === categoryFilter)
  }).sort((left, right) => {
    if (sort === "price-low") return Number(left.price || 0) - Number(right.price || 0)
    if (sort === "price-high") return Number(right.price || 0) - Number(left.price || 0)
    return left.name.localeCompare(right.name)
  }), [products, search, categoryFilter, sort])

  const categories = useMemo(() => Array.from(new Map(products.map((product) => [product.category.id, product.category])).values()), [products])

  const total = cartTotal(cart)
  const cartItemCount = cart.reduce((count, item) => count + item.quantity, 0)

  function addToCart(product: Product) {
    if (product.availableForPurchase === false || product.price == null || product.stockStatus === "OUT_OF_STOCK") return
    setCart((current) => {
      const existing = current.find((item) => item.id === product.id)
      const minimum = Number(product.minOrderQuantity || 1)
      if (existing) return current.map((item) => item.id === product.id ? { ...item, price: product.price, availableForPurchase: true, quantity: item.quantity + 1 } : item)
      return [...current, { ...product, vendor: { id: "rawat-farm", name: "Rawat Farm" }, quantity: Math.max(1, minimum) }]
    })
    setMessage(t("productAdded", { product: product.name }))
  }

  function removeFromCart(id: string) {
    setCart((current) => current.filter((item) => item.id !== id))
  }

  function logoutCustomer() {
    clearShopSession()
    setCustomer(null)
  }

  return (
    <main className="marketplace">
      <header className="market-header">
        <button className="market-brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Rawat Farm home"><span className="market-logo">RF</span><span><strong>Rawat Farm</strong><small>{t("freshFromOurFarm")}</small></span></button>
        <label className="market-search"><span>Rawat Farm</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("searchProductsPlaceholder")} aria-label={t("search")} /></label>
        <div className="market-nav">{sessionHydrated && customer ? <><span className="market-greeting">{translateCustomerGreeting(customer.name, language)}</span><button className="market-link" onClick={() => router.push("/khata")}>{t("khata")}</button><button className="market-link" onClick={logoutCustomer}>{t("logout")}</button></> : <>{sessionHydrated && <button className="market-link" onClick={() => router.push("/customer/login")}>{t("login")}</button>}</>}<button className="market-link" onClick={() => router.push("/orders")}>{t("myOrders")}</button><button className="cart-pill" onClick={() => router.push("/checkout")} aria-label={`${t("cart")}: ${t("itemsCount", { count: cartItemCount })}`}>{t("cart")} <strong>{cartItemCount}</strong> <span>₹{total.toLocaleString("en-IN")}</span></button></div>
      </header>
      <section className="market-intro"><div><p className="market-kicker">RAWAT FARM</p><h1>{t("freshFoodTagline")}</h1><p>{t("shopFreshEssentials")}</p></div><div className="intro-mark">{t("freshDaily")}</div></section>
      <section className="market-layout">
        <div className="catalog-area"><div className="section-heading"><div><p className="market-kicker">{t("shopTheMarket")}</p><h2>{t("popularToday")}</h2></div><span>{loading ? t("loading") : t("productCount", { count: filteredProducts.length })}</span></div>
          <div className="market-filters"><label>{t("category")}<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">{t("allCategories")}</option>{categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label><label>{t("sort")}<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="name">{t("nameSort")}</option><option value="price-low">{t("lowPriceFirst")}</option><option value="price-high">{t("highPriceFirst")}</option></select></label>{(search || categoryFilter || sort !== "name") && <button className="clear-filters" onClick={() => { setSearch(""); setCategoryFilter(""); setSort("name") }}>{t("clearFilters")}</button>}</div>
          {error && <div className="market-message error" role="alert">{error}<br /><button onClick={loadProducts}>{t("tryAgain")}</button></div>}
          {message && !error && <div className="market-message" role="status">{message}</div>}
          {loading ? <div className="product-grid" aria-label={t("loading")}><div className="product-card skeleton" /><div className="product-card skeleton" /><div className="product-card skeleton" /></div> : !error && filteredProducts.length === 0 ? <div className="market-empty"><strong>{t("noProductsMatch")}</strong><br />{t("tryAnotherSearch")}</div> : <div className="product-grid">{filteredProducts.map((product) => <article className="product-card" key={product.id} onClick={() => router.push(`/products/${product.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") router.push(`/products/${product.id}`) }} tabIndex={0} role="link" aria-label={t("productDetails")}>
            <div className="product-image"><MediaImage src={product.imageUrl} alt={product.name} fallback={product.name.slice(0, 1)} /></div>
            <div className="product-body"><p className="vendor-name">{t("soldBy")} {product.vendor.name}</p><h3>{product.name}</h3><p className="product-description">{product.description || t("qualityPackedFresh")}</p><p className={`stock-status ${product.stockStatus.toLowerCase()}`}>{t(product.stockStatus === "LOW_STOCK" ? "onlyFewLeft" : product.stockStatus === "OUT_OF_STOCK" ? "unavailable" : product.stockStatus === "NOT_TRACKED" ? "available" : "inStock")}</p><div className="product-footer"><strong>{product.price == null ? "Price unavailable" : `₹${Number(product.price).toLocaleString("en-IN")}`} <small>/ {product.unit.code}</small></strong><button disabled={product.stockStatus === "OUT_OF_STOCK" || product.availableForPurchase === false || product.price == null} onClick={(event) => { event.stopPropagation(); addToCart(product) }} aria-label={product.stockStatus === "OUT_OF_STOCK" || product.availableForPurchase === false || product.price == null ? `${product.name} unavailable` : t("addProductToCart", { product: product.name })}>{product.stockStatus === "OUT_OF_STOCK" || product.availableForPurchase === false || product.price == null ? t("unavailable") : t("add")}</button></div></div>
          </article>)}</div>}
        </div>
        <aside className="cart-panel"><div className="cart-heading"><h2>{t("cart")}</h2><span>{t("itemsCount", { count: cartItemCount })}</span></div>{cart.length === 0 ? <div className="cart-empty"><span>+</span><p>{t("cartWaiting")}</p><button className="cart-browse" onClick={() => document.querySelector(".product-grid")?.scrollIntoView({ behavior: "smooth" })}>{t("browseProducts")}</button></div> : <><div className="cart-items">{cart.map((item) => <div className="cart-item" key={item.id}><div><strong>{item.name}</strong><small>{item.vendor.name}</small><div className="quantity-control"><button onClick={() => setCart((current) => updateCartQuantity(current, item.id, item.quantity - 1))} aria-label={`${t("decrease")} ${item.name}`}>−</button><span>{item.quantity}</span><button onClick={() => setCart((current) => updateCartQuantity(current, item.id, item.quantity + 1))} aria-label={`${t("increase")} ${item.name}`}>+</button><em>₹{(Number(item.price || 0) * item.quantity).toLocaleString("en-IN")}</em></div></div><button onClick={() => removeFromCart(item.id)} aria-label={`${t("remove")} ${item.name}`}>×</button></div>)}</div><div className="cart-total"><span>{t("total")}</span><strong>₹{total.toLocaleString("en-IN")}</strong></div><button className="checkout-button" onClick={() => router.push("/checkout")}>{t("checkout")}</button></>}</aside>
      </section>
    </main>
  )
}

function translateCustomerGreeting(name: string | undefined, language: ReturnType<typeof useLanguage>["language"]): string {
  const firstName = name?.split(" ")[0] || "Customer"
  return language === "hi" ? `नमस्ते, ${firstName}` : language === "hinglish" ? `Hi, ${firstName}` : `Hi, ${firstName}`
}
