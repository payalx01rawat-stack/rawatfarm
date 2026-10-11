export type CustomerSessionUser = {
  id: string
  name?: string
  email?: string | null
  mobile?: string | null
  roles?: string[]
  preferredLanguage?: string
}

const ACCESS_TOKEN_KEY = "farmmitra_access_token"
const SHOP_TOKEN_KEY = "farmmitra_shop_token"
const SHOP_USER_KEY = "farmmitra_shop_user"

function tokenIsExpired(token: string): boolean {
  try {
    const payload = token.split(".")[1]
    if (!payload) return true
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/")
    const decoded = JSON.parse(atob(normalized)) as { exp?: unknown }
    return typeof decoded.exp !== "number" || !Number.isFinite(decoded.exp) || decoded.exp * 1000 <= Date.now()
  } catch {
    return true
  }
}

export function readCustomerSession(): CustomerSessionUser | null {
  if (typeof window === "undefined") return null

  try {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY)
    const savedUser = localStorage.getItem(SHOP_USER_KEY)
    if (!accessToken || !savedUser) return null

    const user = JSON.parse(savedUser) as CustomerSessionUser
    return Array.isArray(user.roles) && user.roles.includes("CUSTOMER") && !tokenIsExpired(accessToken) ? user : null
  } catch {
    return null
  }
}

export function customerAccessToken(): string | null {
  if (typeof window === "undefined") return null
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (!accessToken || !readCustomerSession()) {
    clearCustomerSession()
    return null
  }
  return accessToken
}

export function customerSessionIsExpired(): boolean {
  if (typeof window === "undefined") return false
  try {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY)
    const savedUser = localStorage.getItem(SHOP_USER_KEY)
    if (!accessToken || !savedUser) return false
    const user = JSON.parse(savedUser) as CustomerSessionUser
    return Array.isArray(user.roles) && user.roles.includes("CUSTOMER") && tokenIsExpired(accessToken)
  } catch {
    return false
  }
}

export function saveCustomerSession(accessToken: string, user: CustomerSessionUser): void {
  if (!accessToken || !Array.isArray(user.roles) || !user.roles.includes("CUSTOMER")) {
    throw new Error("A valid customer session is required")
  }
  localStorage.removeItem(SHOP_TOKEN_KEY)
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  localStorage.setItem(SHOP_USER_KEY, JSON.stringify(user))
}

export function clearCustomerSession(): void {
  if (typeof window === "undefined") return
  let savedUser: CustomerSessionUser | null = null
  try {
    savedUser = JSON.parse(localStorage.getItem(SHOP_USER_KEY) || "null") as CustomerSessionUser | null
  } catch {
    savedUser = null
  }
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  if (savedUser?.roles?.includes("CUSTOMER")) localStorage.removeItem(SHOP_USER_KEY)
}

export function clearShopSession(): void {
  if (typeof window === "undefined") return
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(SHOP_TOKEN_KEY)
  localStorage.removeItem(SHOP_USER_KEY)
}