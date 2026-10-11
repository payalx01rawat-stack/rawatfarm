"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { languageAfterLogin, notifyLanguageSessionAuthenticated } from "@farmmitra/shared-utils/src/language-session"
import { useLanguage } from "@farmmitra/shared-utils/src/LanguageProvider"

export default function LoginPage() {
  const router = useRouter()
  const { setLanguage } = useLanguage()
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || data?.message || "Unable to sign in")
      const roles = Array.isArray(data?.user?.roles) ? data.user.roles : []
      if (!roles.some((role: unknown) => ["VENDOR", "VENDOR_ADMIN", "VENDOR_STAFF"].includes(String(role)))) {
        throw new Error("A vendor account is required for this portal")
      }
      localStorage.removeItem("farmmitra_access_token")
      localStorage.setItem("farmmitra_shop_token", data.accessToken)
      localStorage.setItem("farmmitra_shop_user", JSON.stringify(data.user))
      const preferredLanguage = languageAfterLogin(data.user?.preferredLanguage)
      if (preferredLanguage) setLanguage(preferredLanguage)
      notifyLanguageSessionAuthenticated()
      router.replace("/vendor/dashboard")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in")
    } finally {
      setLoading(false)
    }
  }

  return <main className="login-page"><section className="login-card"><div className="brand"><div className="logo">FM</div><div><h1>FarmMitra</h1><p>Vendor Portal</p></div></div><div className="heading"><h2>Welcome back</h2><p>Sign in to manage your vendor operations.</p></div><form onSubmit={submit}><label htmlFor="vendor-identifier">Email or mobile</label><input id="vendor-identifier" type="text" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="vendor@example.com" autoComplete="username" required /><label htmlFor="vendor-password">Password</label><input id="vendor-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" autoComplete="current-password" required />{error && <div className="message error" role="alert">{error}</div>}<button type="submit" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button></form><button className="secondary" type="button" onClick={() => router.push("/")}>Back to marketplace</button></section></main>
}
