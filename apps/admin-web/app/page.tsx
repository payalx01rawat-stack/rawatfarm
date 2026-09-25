"use client"

import { FormEvent, useState } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.API_BASE_URL || "http://localhost:4000"

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setLoading(true)
    setError("")

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          identifier,
          password,
        }),
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

      localStorage.setItem(
        "farmmitra_access_token",
        data.accessToken
      )

      if (data?.user) {
        localStorage.setItem(
          "farmmitra_user",
          JSON.stringify(data.user)
        )
      }

      window.location.href = "/dashboard"
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
      <div className="login-card">
        <div className="brand">
          <div className="logo">FM</div>

          <div>
            <h1>FarmMitra</h1>
            <p>Admin Portal</p>
          </div>
        </div>

        <div className="heading">
          <h2>Welcome back</h2>
          <p>Sign in to manage your FarmMitra operations.</p>
        </div>

        <form onSubmit={handleSubmit}>
          <label htmlFor="identifier">Email</label>

          <input
            id="identifier"
            type="email"
            placeholder="admin@farmmitra.local"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
            autoComplete="username"
          />

          <label htmlFor="password">Password</label>

          <input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
          />

          {error && (
            <div className="message error">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="connection">
          <span className="dot" />
          API: {API_URL}
        </div>
      </div>
    </main>
  )
}
