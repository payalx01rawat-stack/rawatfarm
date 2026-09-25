"use client"

import { usePathname, useRouter } from "next/navigation"
import type { ReactNode } from "react"

export function PortalShell({ title, subtitle, children, links = [] }: { title: string; subtitle?: string; children: ReactNode; links?: { label: string; href: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const isVendor = pathname.startsWith("/vendor")
  const navigation = isVendor ? [{ label: "Dashboard", href: "/vendor/dashboard" }, { label: "Products", href: "/vendor/products" }, { label: "Inventory", href: "/vendor/inventory" }, { label: "Orders", href: "/vendor/orders" }, { label: "Delivery", href: "/vendor/delivery-dashboard" }, { label: "Collections", href: "/vendor/collections" }, { label: "Outstanding", href: "/vendor/outstanding" }, { label: "Settings", href: "/vendor/settings" }] : links
  function logout() {
    localStorage.removeItem("farmmitra_shop_token")
    localStorage.removeItem("farmmitra_shop_user")
    localStorage.removeItem("farmmitra_access_token")
    router.replace("/")
  }
  return <main className={`portal-page ${isVendor ? "vendor-portal" : ""}`}><header className="portal-header"><button className="portal-brand" onClick={() => router.push(isVendor ? "/vendor/dashboard" : "/")} aria-label={isVendor ? "Go to vendor dashboard" : "Go to FarmMitra marketplace"}><span>FM</span><strong>FarmMitra</strong></button><nav aria-label={isVendor ? "Vendor operations navigation" : "Customer navigation"}>{navigation.map((link) => <button className={pathname === link.href ? "active" : ""} key={link.href} onClick={() => router.push(link.href)} aria-current={pathname === link.href ? "page" : undefined}>{link.label}</button>)}</nav><button className="portal-logout" onClick={logout}>Log out</button></header><section className="portal-content"><div className="portal-title"><div><p className="market-kicker">{isVendor ? "VENDOR OPERATIONS" : "CUSTOMER MARKETPLACE"}</p><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div></div>{children}</section></main>
}

export function StateMessage({ children, error = false }: { children: ReactNode; error?: boolean }) { return <div className={error ? "portal-message error" : "portal-message"} role={error ? "alert" : "status"}>{children}</div> }
