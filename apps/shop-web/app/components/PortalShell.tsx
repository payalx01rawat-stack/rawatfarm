"use client"

import { usePathname, useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { translateText } from "@farmmitra/shared-utils"
import { useLanguage } from "@farmmitra/shared-utils/src/LanguageProvider"
import { clearShopSession } from "../lib/customer-session"

export function PortalShell({ title, subtitle, children, links = [] }: { title: string; subtitle?: string; children: ReactNode; links?: { label: string; href: string }[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const { language } = useLanguage()
  const isVendor = pathname.startsWith("/vendor")
  const visibleSubtitle = subtitle?.replace("One order, separated safely by vendor.", "One Rawat Farm order.")
  const navigation = isVendor ? [{ label: "Dashboard", href: "/vendor/dashboard" }, { label: "Products", href: "/vendor/products" }, { label: "Inventory", href: "/vendor/inventory" }, { label: "Orders", href: "/vendor/orders" }, { label: "Delivery", href: "/vendor/delivery-dashboard" }, { label: "Collections", href: "/vendor/collections" }, { label: "Outstanding", href: "/vendor/outstanding" }, { label: "Settings", href: "/vendor/settings" }] : [{ label: "Khata", href: "/khata" }, ...links.filter((link) => link.href !== "/khata")]
  function logout() {
    if (isVendor) {
      localStorage.removeItem("farmmitra_shop_token")
      localStorage.removeItem("farmmitra_shop_user")
    } else {
      clearShopSession()
    }
    router.replace("/")
  }
  return <main className={`portal-page ${isVendor ? "vendor-portal" : ""}`}><header className="portal-header"><button className="portal-brand" onClick={() => router.push(isVendor ? "/vendor/dashboard" : "/")} aria-label={isVendor ? "Rawat Farm operations home" : "Rawat Farm shop home"}><span>RF</span><strong>Rawat Farm</strong></button><nav aria-label={isVendor ? "Rawat Farm operations navigation" : "Customer navigation"}>{navigation.map((link) => <button className={pathname === link.href ? "active" : ""} key={link.href} onClick={() => router.push(link.href)} aria-current={pathname === link.href ? "page" : undefined}>{link.label === "Marketplace" ? "Shop" : translateText(link.label, language)}</button>)}</nav><button className="portal-logout" onClick={logout}>{translateText("Log out", language)}</button></header><section className="portal-content"><div className="portal-title"><div><p className="market-kicker">{isVendor ? "RAWAT FARM OPERATIONS" : "RAWAT FARM SHOP"}</p><h1>{translateText(title, language)}</h1>{visibleSubtitle && <p>{translateText(visibleSubtitle, language)}</p>}</div></div>{children}</section></main>
}

export function StateMessage({ children, error = false }: { children: ReactNode; error?: boolean }) { return <div className={error ? "portal-message error" : "portal-message"} role={error ? "alert" : "status"}>{children}</div> }
