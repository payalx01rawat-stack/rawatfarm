export const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:4000"

export function token() {
  if (typeof window === "undefined") return ""
  return localStorage.getItem("farmmitra_access_token") || localStorage.getItem("farmmitra_shop_token") || ""
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(options.headers || {}) },
  })
  const data = await response.json().catch(() => null)
  if (response.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("farmmitra_access_token")
    localStorage.removeItem("farmmitra_shop_token")
    localStorage.removeItem("farmmitra_shop_user")
    window.location.assign("/")
  }
  if (!response.ok) throw new Error(data?.error || data?.message || "Request failed")
  return data as T
}
