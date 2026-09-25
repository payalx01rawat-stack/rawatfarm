const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:4000"

export const tokenKey = "farmmitra_delivery_token"

export async function api<T>(path: string, options: RequestInit = {}, accessToken?: string): Promise<T> {
  const token = accessToken || (typeof window !== "undefined" ? localStorage.getItem(tokenKey) : "")
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  const data = await response.json().catch(() => null)
  if (response.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem(tokenKey)
    localStorage.removeItem("farmmitra_delivery_user")
    window.location.assign("/")
  }
  if (!response.ok) throw new Error(data?.error || "Request failed")
  return data as T
}
