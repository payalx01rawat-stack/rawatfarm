"use client"

import { FormEvent, useState } from "react"
import { useRouter } from "next/navigation"
import {
  languageAfterLogin,
  notifyLanguageSessionAuthenticated,
} from "@farmmitra/shared-utils/src/language-session"
import {
  useLanguage,
  useTranslation,
} from "@farmmitra/shared-utils/src/LanguageProvider"

const API_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.API_BASE_URL ||
  "http://localhost:4000"

export default function LoginPage() {
  const router = useRouter()
  const { setLanguage } = useLanguage()
  const { t } = useTranslation()

  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data?.message ||
          data?.error ||
          "Login failed. Please check your credentials."
        )
      }

      if (!data?.accessToken) {
        throw new Error("Login succeeded but no access token was returned.")
      }

      localStorage.setItem("farmmitra_access_token", data.accessToken)

      if (data?.user) {
        localStorage.setItem("farmmitra_user", JSON.stringify(data.user))
        const preferredLanguage = languageAfterLogin(
          data.user.preferredLanguage
        )
        if (preferredLanguage) setLanguage(preferredLanguage)
      }

      notifyLanguageSessionAuthenticated()
      router.replace(data?.user?.roles?.includes("CHILD_ADMIN") ? "/child-admin" : "/dashboard")
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-showcase">
        <div className="login-showcase-top">
          <div className="login-brand-mark">FM</div>
          <div className="login-brand-copy">
            <strong>Rawat Farm</strong>
            <span>ADMINISTRATION PORTAL</span>
          </div>
        </div>

        <div className="login-showcase-content">
          <div className="login-eyebrow">
            <span className="login-eyebrow-dot" />
            YOUR FARM. YOUR BUSINESS. ONE PLACE.
          </div>

          <h1>
            Good farming.
            <br />
            <span>Better business.</span>
          </h1>

          <p>
            A simpler way to manage your farm operations, keep your
            business organised, and stay connected with your daily work.
          </p>

          <div className="login-feature-list">
            <div className="login-feature">
              <div className="login-feature-icon" aria-hidden="true">
                &#9635;
              </div>
              <div>
                <strong>Operations at a glance</strong>
                <span>Keep track of your business in one place.</span>
              </div>
            </div>

            <div className="login-feature">
              <div className="login-feature-icon" aria-hidden="true">
                &#10003;
              </div>
              <div>
                <strong>Stay in control</strong>
                <span>Access your administration tools securely.</span>
              </div>
            </div>

            <div className="login-feature">
              <div className="login-feature-icon" aria-hidden="true">
                &#8599;
              </div>
              <div>
                <strong>Built for everyday work</strong>
                <span>A clear workspace for your daily decisions.</span>
              </div>
            </div>
          </div>
        </div>

        <div className="login-showcase-footer">
          <span className="login-footer-leaf">&#10022;</span>
          <span>Growing better, together.</span>
          <span aria-hidden="true">·</span>
          <span>Rawat Farm</span>
        </div>
      </section>

      <section className="login-form-side">
        <div className="login-form-wrap">
          <div className="login-mobile-brand">
            <div className="login-brand-mark">FM</div>
            <strong>Rawat Farm</strong>
          </div>

          <div className="login-welcome">
            <span className="login-form-kicker">ADMIN PORTAL</span>
            <h2>{t("welcomeBack")}</h2>
            <p>{t("signInToManage")}</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
              <label htmlFor="identifier">{t("email")}</label>
              <div className="login-input-wrap">
                <span className="login-input-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="5" width="18" height="14" rx="3"
                      stroke="currentColor" strokeWidth="1.7" />
                    <path d="m4 7 8 6 8-6"
                      stroke="currentColor" strokeWidth="1.7"
                      strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <input
                  id="identifier"
                  type="email"
                  placeholder="admin@farmmitra.local"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="login-field">
              <div className="login-label-row">
                <label htmlFor="password">{t("password")}</label>
                <span className="login-secure-label">
                  <span />
                  Secure sign-in
                </span>
              </div>

              <div className="login-input-wrap">
                <span className="login-input-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <rect x="4" y="10" width="16" height="11" rx="2.5"
                      stroke="currentColor" strokeWidth="1.7" />
                    <path d="M8 10V7a4 4 0 0 1 8 0v3"
                      stroke="currentColor" strokeWidth="1.7"
                      strokeLinecap="round" />
                    <circle cx="12" cy="15" r="1.3" fill="currentColor" />
                  </svg>
                </span>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t("enterPassword")}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  className="login-password-toggle"
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "HIDE" : "SHOW"}
                </button>
              </div>
            </div>

            {error && (
              <div className="login-error" role="alert">
                <span className="login-error-icon">!</span>
                <span>{error}</span>
              </div>
            )}

            <button
              className="login-submit"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="login-spinner" />
                  {t("signingIn")}
                </>
              ) : (
                <>
                  {t("signIn")}
                  <span className="login-submit-arrow" aria-hidden="true">
                    &#8594;
                  </span>
                </>
              )}
            </button>
          </form>

          <div className="login-security-note">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 3 19 6v5c0 4.6-2.9 8-7 10-4.1-2-7-5.4-7-10V6l7-3Z"
                stroke="currentColor" strokeWidth="1.6"
                strokeLinejoin="round" />
              <path d="m9 12 2 2 4-4"
                stroke="currentColor" strokeWidth="1.6"
                strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>
              Your account is protected by the FarmMitra authentication
              system. Sign in using your existing admin credentials.
            </span>
          </div>

          <div className="login-connection">
            <span className="login-connection-dot" />
            <span>API connection</span>
            <code>{API_URL}</code>
          </div>

          <p className="login-copyright">
            © {new Date().getFullYear()} Rawat Farm. All rights reserved.
          </p>
        </div>
      </section>
    </main>
  )
}
