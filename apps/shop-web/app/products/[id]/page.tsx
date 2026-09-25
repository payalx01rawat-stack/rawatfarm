"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { MediaImage } from "../../components/MediaImage"
import { PortalShell, StateMessage } from "../../components/PortalShell"
import { api } from "../../lib/api"
import { readCart, writeCart } from "../../lib/cart"

type Product = { id: string; name: string; description?: string | null; imageUrl?: string | null; price?: string | number | null; unit: { code: string }; category: { name: string }; vendor: { id: string; name: string }; stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" | "NOT_TRACKED" }

const stockLabel = (status: Product["stockStatus"]): string => status === "LOW_STOCK" ? "Only a few left" : status === "OUT_OF_STOCK" ? "Out of stock" : status === "NOT_TRACKED" ? "Available" : "In stock"

export default function ProductDetails() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function loadProduct() {
    setError("")
    try {
      const products = await api<Product[]>("/api/v1/marketplace/products")
      const found = products.find((item) => item.id === params.id)
      if (!found) throw new Error("Product not found")
      setProduct(found)
    } catch (reason) {
      setProduct(null)
      setError(reason instanceof Error ? reason.message : "Unable to load product")
    }
  }

  useEffect(() => { loadProduct() }, [params.id])

  function addToCart() {
    if (!product || product.stockStatus === "OUT_OF_STOCK") return
    const existing = readCart()
    const next = existing.some((item) => item.id === product.id)
      ? existing.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + quantity } : item)
      : [...existing, { ...product, quantity }]
    writeCart(next)
    setMessage(`${product.name} added to cart.`)
  }

  return <PortalShell title={product?.name || "Product details"} subtitle={product ? `Sold by ${product.vendor.name}` : "A clear view of what you are buying"} links={[{ label: "Marketplace", href: "/" }, { label: "My orders", href: "/orders" }]}>
    {error && <StateMessage error>{error}<br /><button onClick={loadProduct}>Try again</button></StateMessage>}
    {message && <StateMessage>{message}</StateMessage>}
    {!product && !error ? <section className="portal-panel skeleton" aria-label="Loading product" /> : product && <div className="portal-grid"><section className="portal-panel product-detail-image"><MediaImage src={product.imageUrl} alt={product.name} fallback={product.name.slice(0, 1)} /></section><section className="portal-panel product-detail-copy"><p className="vendor-name">{product.category.name}</p><h2>{product.name}</h2><p className="product-detail-description">{product.description || "Quality checked and packed fresh."}</p><p className="stock-status">{stockLabel(product.stockStatus)}</p><div className="product-detail-price"><strong>₹{Number(product.price || 0).toLocaleString("en-IN")}</strong><span>per {product.unit.code}</span></div><p className="vendor-name">Sold by {product.vendor.name}</p><label>Quantity<input disabled={product.stockStatus === "OUT_OF_STOCK"} type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Math.floor(Number(event.target.value)) || 1))} aria-describedby="quantity-help" /></label><small id="quantity-help" className="muted">You can adjust this later in your cart.</small><div className="portal-actions"><button className="primary" disabled={product.stockStatus === "OUT_OF_STOCK"} onClick={addToCart}>{product.stockStatus === "OUT_OF_STOCK" ? "Out of stock" : "Add to cart"}</button><button className="secondary" onClick={() => router.push("/checkout")}>Go to cart</button><button className="secondary" onClick={() => router.push("/")}>Continue shopping</button></div></section></div>}
  </PortalShell>
}