"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import { loginCustomer } from "../../lib/customer-login"
import { languageAfterLogin, notifyLanguageSessionAuthenticated } from "@farmmitra/shared-utils/src/language-session"
import { useLanguage, useTranslation } from "@farmmitra/shared-utils/src/LanguageProvider"

export default function CustomerLoginPage() {
  const router = useRouter()
  const { setLanguage } = useLanguage()
  const { t } = useTranslation()
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")
    try {
      const user = await loginCustomer(identifier, password)
      const preferredLanguage = languageAfterLogin(user.preferredLanguage)
      if (preferredLanguage) setLanguage(preferredLanguage)
      notifyLanguageSessionAuthenticated()
      router.replace("/")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in")
    } finally {
      setLoading(false)
    }
  }

  return <main className="login-page"><section className="login-card"><div className="brand"><div className="logo">RF</div><div><h1>Rawat Farm</h1><p>{t("customerShop")}</p></div></div><div className="heading"><h2>{t("signInToContinue")}</h2><p>{t("savedAddressesOrders")}</p></div><form onSubmit={submit}><label htmlFor="customer-identifier">{t("emailOrMobile")}</label><input id="customer-identifier" type="text" value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" required /><label htmlFor="customer-password">{t("password")}</label><input id="customer-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />{error && <div className="message error" role="alert">{error}</div>}<button type="submit" disabled={loading}>{loading ? t("signingIn") : t("signIn")}</button></form><p className="auth-switch">Customer accounts are enrolled by FarmMitra administrators. Contact the shop administrator if you need access.</p><button className="secondary" type="button" onClick={() => router.push("/")}>{t("backToShop")}</button></section></main>
}