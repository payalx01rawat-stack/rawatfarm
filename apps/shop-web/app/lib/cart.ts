export type CartProduct = {
  id: string
  name: string
  imageUrl?: string | null
  price?: string | number | null
  unit: { code: string }
  vendor: { id: string; name: string }
}

export type CartItem = CartProduct & { quantity: number }

export const CART_STORAGE_KEY = "farmmitra_cart"

export function readCart(): CartItem[] {
  if (typeof window === "undefined") return []
  try {
    const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]")
    return Array.isArray(saved) ? saved.filter((item) => item?.id && Number(item.quantity) > 0) : []
  } catch {
    return []
  }
}

export function writeCart(items: CartItem[]): void {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((total, item) => total + Number(item.price || 0) * item.quantity, 0)
}

export function updateCartQuantity(items: CartItem[], id: string, quantity: number): CartItem[] {
  if (quantity <= 0) return items.filter((item) => item.id !== id)
  return items.map((item) => item.id === id ? { ...item, quantity } : item)
}
