export const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:4000"
export const ACCESS_TOKEN_KEY = "farmmitra_access_token"
export const USER_KEY = "farmmitra_user"
const API_REQUEST_TIMEOUT_MS = 15_000

export async function withAdminApiTimeout<T>(request: (signal: AbortSignal) => Promise<T>, timeoutMs = API_REQUEST_TIMEOUT_MS, signal?: AbortSignal | null): Promise<T> {
  const controller = new AbortController()
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const abortRequest = () => controller.abort(signal?.reason)
  if (signal?.aborted) abortRequest()
  else signal?.addEventListener("abort", abortRequest, { once: true })
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error("The API request timed out. Check the API connection and try again.")
      controller.abort(error)
      reject(error)
    }, timeoutMs)
  })

  try {
    return await Promise.race([request(controller.signal), timeout])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
    signal?.removeEventListener("abort", abortRequest)
  }
}

export function getAdminToken(): string {
  if (typeof window === "undefined") {
    return ""
  }

  return localStorage.getItem(ACCESS_TOKEN_KEY) || ""
}

export function clearAdminSession(): void {
  if (typeof window === "undefined") {
    return
  }

  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

export async function fetchAdminJson<T>(path: string, init: RequestInit = {}, token = getAdminToken()): Promise<T> {
  const headers = new Headers(init.headers || {})

  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  return withAdminApiTimeout(async (signal) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers,
      signal,
    })

    if (response.status === 401) {
      clearAdminSession()
      if (typeof window !== "undefined") {
        window.location.href = "/"
      }
      throw new Error("Your admin session has expired. Please sign in again.")
    }

    const text = await response.text()
    const data = text ? JSON.parse(text) : null

    if (!response.ok) {
      throw new Error(data?.error || data?.message || "Request failed")
    }

    return (data as T) ?? ({} as T)
  }, API_REQUEST_TIMEOUT_MS, init.signal)
}

export function formatCurrency(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0)
  return `₹${amount.toLocaleString("en-IN")}`
}

export function formatDateTime(value?: string | null): string {
  if (!value) {
    return "—"
  }

  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Kolkata",
  })
}

export function formatDate(value?: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  })
}

export function formatTime(value?: string | null): string {
  if (!value) return "—"
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  })
}

export function normalizeStatusClass(value: string): string {
  return value.toLowerCase().replaceAll("_", "-")
}
