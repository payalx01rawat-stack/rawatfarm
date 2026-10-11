import assert from "node:assert/strict"
import test from "node:test"
import { customerApi, customerCatalogApi, CustomerSessionError } from "./customer-api"
import { loginCustomer } from "./customer-login"
import { clearCustomerSession, clearShopSession, customerAccessToken, readCustomerSession } from "./customer-session"

type TestStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function installStorage() {
  const values = new Map<string, string>()
  const storage: TestStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
    removeItem: (key) => { values.delete(key) },
  }
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  const priorStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } })
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage })
  return () => {
    if (priorWindow) Object.defineProperty(globalThis, "window", priorWindow)
    else Reflect.deleteProperty(globalThis, "window")
    if (priorStorage) Object.defineProperty(globalThis, "localStorage", priorStorage)
    else Reflect.deleteProperty(globalThis, "localStorage")
  }
}

const tokenWithExpiry = (expiresAt: number) => `header.${Buffer.from(JSON.stringify({ exp: expiresAt })).toString("base64url")}.signature`
const customer = { id: "customer-test-id", name: "Test Customer", roles: ["CUSTOMER"] }

test("customer login posts expected body and persists API response session across reload", async () => {
  const restoreStorage = installStorage()
  const originalFetch = globalThis.fetch
  const accessToken = tokenWithExpiry(Math.floor(Date.now() / 1000) + 3600)
  let requestUrl = ""
  let requestBody = ""
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input)
      requestBody = String(init?.body)
      return new Response(JSON.stringify({ user: customer, accessToken }), { status: 200 })
    }) as typeof fetch

    const user = await loginCustomer("customer@example.test", "test-only-password")
    assert.equal(requestUrl, "/api/auth/login")
    assert.deepEqual(JSON.parse(requestBody), { identifier: "customer@example.test", password: "test-only-password" })
    assert.deepEqual(user.roles, ["CUSTOMER"])
    assert.equal(customerAccessToken(), accessToken)
    assert.equal(readCustomerSession()?.id, customer.id)
    assert.equal(localStorage.getItem("farmmitra_access_token"), accessToken)
    assert.equal(localStorage.getItem("farmmitra_shop_user") !== null, true)
  } finally {
    globalThis.fetch = originalFetch
    restoreStorage()
  }
})

test("customer API attaches the customer bearer token for checkout", async () => {
  const restoreStorage = installStorage()
  const originalFetch = globalThis.fetch
  const accessToken = tokenWithExpiry(Math.floor(Date.now() / 1000) + 3600)
  let requestUrl = ""
  let authorization = ""
  try {
    localStorage.setItem("farmmitra_access_token", accessToken)
    localStorage.setItem("farmmitra_shop_user", JSON.stringify(customer))
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input)
      authorization = new Headers(init?.headers).get("Authorization") || ""
      return new Response(JSON.stringify({ id: "temporary-master-order" }), { status: 201 })
    }) as typeof fetch

    const result = await customerApi<{ id: string }>("/api/v1/marketplace/orders", {
      method: "POST",
      body: JSON.stringify({ addressId: "address-test", items: [] }),
    })
    assert.equal(requestUrl.endsWith("/api/v1/marketplace/orders"), true)
    assert.equal(authorization, `Bearer ${accessToken}`)
    assert.deepEqual(result, { id: "temporary-master-order" })
  } finally {
    globalThis.fetch = originalFetch
    restoreStorage()
  }
})

test("catalog uses a customer token when available and never forwards a vendor token", async () => {
  const restoreStorage = installStorage()
  const originalFetch = globalThis.fetch
  const accessToken = tokenWithExpiry(Math.floor(Date.now() / 1000) + 3600)
  const authorizationHeaders: Array<string | null> = []
  try {
    localStorage.setItem("farmmitra_access_token", accessToken)
    localStorage.setItem("farmmitra_shop_user", JSON.stringify(customer))
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      authorizationHeaders.push(new Headers(init?.headers).get("Authorization"))
      return new Response("[]", { status: 200 })
    }) as typeof fetch

    await customerCatalogApi("/api/v1/marketplace/products")
    localStorage.removeItem("farmmitra_access_token")
    localStorage.setItem("farmmitra_shop_token", "vendor-session-token")
    localStorage.setItem("farmmitra_shop_user", JSON.stringify({ id: "vendor-id", roles: ["VENDOR"] }))
    await customerCatalogApi("/api/v1/marketplace/products")

    assert.equal(authorizationHeaders[0], `Bearer ${accessToken}`)
    assert.equal(authorizationHeaders[1], null)
  } finally {
    globalThis.fetch = originalFetch
    restoreStorage()
  }
})

test("customer login rejects a non-customer identity without persisting its token", async () => {
  const restoreStorage = installStorage()
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      user: { id: "vendor-id", roles: ["VENDOR"] },
      accessToken: tokenWithExpiry(Math.floor(Date.now() / 1000) + 3600),
    }), { status: 200 })) as typeof fetch

    await assert.rejects(loginCustomer("vendor@example.test", "test-only-password"), /not authorized for customer shopping/i)
    assert.equal(localStorage.getItem("farmmitra_access_token"), null)
  } finally {
    globalThis.fetch = originalFetch
    restoreStorage()
  }
})

test("missing or expired customer sessions stop checkout before an API request", async () => {
  const restoreStorage = installStorage()
  const originalFetch = globalThis.fetch
  let fetchCalls = 0
  try {
    localStorage.setItem("farmmitra_shop_token", "vendor-session-token")
    localStorage.setItem("farmmitra_shop_user", JSON.stringify({ id: "vendor-id", roles: ["VENDOR"] }))
    globalThis.fetch = (async () => {
      fetchCalls += 1
      return new Response("{}", { status: 200 })
    }) as typeof fetch
    await assert.rejects(customerApi("/api/v1/marketplace/orders"), CustomerSessionError)
    assert.equal(fetchCalls, 0)
    assert.equal(localStorage.getItem("farmmitra_shop_token"), "vendor-session-token")
    assert.equal(localStorage.getItem("farmmitra_shop_user") !== null, true)

    localStorage.setItem("farmmitra_access_token", tokenWithExpiry(Math.floor(Date.now() / 1000) - 60))
    localStorage.setItem("farmmitra_shop_user", JSON.stringify(customer))
    await assert.rejects(customerApi("/api/v1/marketplace/orders"), /session has expired/i)
    assert.equal(fetchCalls, 0)
    assert.equal(localStorage.getItem("farmmitra_access_token"), null)
    assert.equal(localStorage.getItem("farmmitra_shop_user"), null)
  } finally {
    globalThis.fetch = originalFetch
    restoreStorage()
  }
})

test("invalid or expired API token clears customer session and reports sign-in path", async () => {
  const restoreStorage = installStorage()
  const originalFetch = globalThis.fetch
  const accessToken = tokenWithExpiry(Math.floor(Date.now() / 1000) + 3600)
  let authorization = ""
  try {
    localStorage.setItem("farmmitra_access_token", accessToken)
    localStorage.setItem("farmmitra_shop_user", JSON.stringify(customer))
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("Authorization") || ""
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 401 })
    }) as typeof fetch

    await assert.rejects(customerApi("/api/v1/marketplace/orders"), /session has expired/i)
    assert.equal(authorization.startsWith("Bearer "), true)
    assert.equal(localStorage.getItem("farmmitra_access_token"), null)
    assert.equal(localStorage.getItem("farmmitra_shop_user"), null)
  } finally {
    globalThis.fetch = originalFetch
    restoreStorage()
  }
})

test("customer logout clears customer and vendor session keys", () => {
  const restoreStorage = installStorage()
  try {
    localStorage.setItem("farmmitra_access_token", "customer-token")
    localStorage.setItem("farmmitra_shop_token", "vendor-token")
    localStorage.setItem("farmmitra_shop_user", JSON.stringify(customer))
    clearShopSession()
    assert.equal(localStorage.getItem("farmmitra_access_token"), null)
    assert.equal(localStorage.getItem("farmmitra_shop_token"), null)
    assert.equal(localStorage.getItem("farmmitra_shop_user"), null)
  } finally {
    restoreStorage()
  }
})

test("clearing an expired customer session does not erase a vendor identity", () => {
  const restoreStorage = installStorage()
  try {
    localStorage.setItem("farmmitra_shop_token", "vendor-token")
    localStorage.setItem("farmmitra_shop_user", JSON.stringify({ id: "vendor-id", roles: ["VENDOR"] }))
    clearCustomerSession()
    assert.equal(localStorage.getItem("farmmitra_shop_token"), "vendor-token")
    assert.deepEqual(JSON.parse(localStorage.getItem("farmmitra_shop_user") || "{}").roles, ["VENDOR"])
  } finally {
    restoreStorage()
  }
})
