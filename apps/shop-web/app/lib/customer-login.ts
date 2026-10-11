import { saveCustomerSession, type CustomerSessionUser } from "./customer-session"

export async function loginCustomer(identifier: string, password: string): Promise<CustomerSessionUser> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  })
  const data = await response.json().catch(() => null)
  if (response.status === 401) throw new Error("Email/mobile or password is incorrect. Please try again.")
  if (!response.ok) throw new Error(data?.error || data?.message || "Unable to sign in")
  if (!Array.isArray(data?.user?.roles) || !data.user.roles.includes("CUSTOMER")) {
    throw new Error("This account is not authorized for customer shopping. Contact an administrator.")
  }
  if (typeof data?.accessToken !== "string" || !data.accessToken) {
    throw new Error("Unable to complete sign in. Please try again.")
  }
  saveCustomerSession(data.accessToken, data.user as CustomerSessionUser)
  return data.user as CustomerSessionUser
}
