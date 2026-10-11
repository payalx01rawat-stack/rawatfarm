import { clearCustomerSession, customerAccessToken, customerSessionIsExpired } from "./customer-session"

export const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:4000"

export class CustomerSessionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CustomerSessionError"
  }
}

async function requestCustomerApi<T>(path: string, options: RequestInit, requireSession: boolean): Promise<T> {
  const expired = customerSessionIsExpired()
  const accessToken = customerAccessToken()
  if (requireSession && !accessToken) {
    if (expired) {
      throw new CustomerSessionError("Your customer session has expired. Sign in again to continue. Your cart has been saved.")
    }
    throw new CustomerSessionError("Sign in with a customer account to continue. Your cart has been saved.")
  }

  const headers = new Headers(options.headers)
  headers.set("Content-Type", "application/json")
  headers.delete("Authorization")
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`)

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  })
  const data = await response.json().catch(() => null)
  if (response.status === 401) {
    if (accessToken) {
      clearCustomerSession()
      throw new CustomerSessionError("Your customer session has expired. Sign in again to continue. Your cart has been saved.")
    }
  }
  if (!response.ok) throw new Error(data?.error || data?.message || "Request failed")
  return data as T
}

export function customerApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  return requestCustomerApi(path, options, true)
}

export function customerCatalogApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  return requestCustomerApi(path, options, false)
}
