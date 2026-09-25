"use client"

import { useRouter } from "next/navigation"
import type { ReactNode } from "react"

export function PortalShell({ title, subtitle, children, links = [] }: { title: string; subtitle?: string; children: ReactNode; links?: { label: string; href: string }[] }) {
  const router = useRouter()
  function logout() {
    localStorage.removeItem("farmmitra_shop_token")
    localStorage.removeItem("farmmitra_shop_user")
    localStorage.removeItem("farmmitra_access_token")
    router.replace("/")
  }
  return <main className="portal-page"><header className="portal-header"><button className="portal-brand" onClick={() => router.push(links[0]?.href || "/")}><span>FM</span><strong>FarmMitra</strong></button><nav>{links.map((link) => <button key={link.href} onClick={() => router.push(link.href)}>{link.label}</button>)}</nav><button className="portal-logout" onClick={logout}>Logout</button></header><section className="portal-content"><div className="portal-title"><div><p className="market-kicker">FARMMITRA OPERATIONS</p><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div></div>{children}</section></main>
}

export function StateMessage({ children, error = false }: { children: ReactNode; error?: boolean }) { return <div className={error ? "portal-message error" : "portal-message"}>{children}</div> }
