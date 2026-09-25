"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { PortalShell, StateMessage } from "../../components/PortalShell"
import { api } from "../../lib/api"

type Product = { id: string; name: string; description?: string | null; imageUrl?: string | null; price?: string | number | null; unit: { code: string }; category: { name: string }; vendor: { id: string; name: string } }

export default function ProductDetails() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [product, setProduct] = useState<Product | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    api<Product[]>("/api/v1/marketplace/products").then((products) => {
      const found = products.find((item) => item.id === params.id)
      if (!found) throw new Error("Product not found")
      setProduct(found)
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load product"))
  }, [params.id])

  function addToCart() {
    if (!product) return
    const existing = JSON.parse(localStorage.getItem("farmmitra_cart") || "[]") as (Product & { quantity: number })[]
    const next = existing.some((item) => item.id === product.id)
      ? existing.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + quantity } : item)
      : [...existing, { ...product, quantity }]
    localStorage.setItem("farmmitra_cart", JSON.stringify(next))
    setMessage("Added to cart")
  }

  return <PortalShell title={product?.name || "Product details"} subtitle={product ? `Sold by ${product.vendor.name}` : "Loading product"} links={[{ label: "Marketplace", href: "/" }, { label: "My orders", href: "/orders" }]}>{error && <StateMessage error>{error}</StateMessage>}{message && <StateMessage>{message}</StateMessage>}{!product && !error ? <StateMessage>Loading product...</StateMessage> : product && <div className="portal-grid"><section className="portal-panel product-detail-image">{product.imageUrl ? <img src={product.imageUrl} alt={product.name} onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.nextElementSibling?.removeAttribute("hidden") }} /> : null}<span hidden={Boolean(product.imageUrl)}>{product.name.slice(0, 1)}</span></section><section className="portal-panel"><p className="vendor-name">{product.category.name}</p><h2>{product.name}</h2><p>{product.description || "Quality checked and packed fresh."}</p><p><strong>₹{Number(product.price || 0).toLocaleString("en-IN")}</strong> / {product.unit.code}</p><label>Quantity<input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} /></label><button className="primary" onClick={addToCart}>Add to cart</button><button className="secondary" onClick={() => router.push("/checkout")}>Go to cart</button></section></div>}</PortalShell>
}