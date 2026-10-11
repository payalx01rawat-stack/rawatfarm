"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { translate } from "@farmmitra/shared-utils"
import { useLanguage } from "@farmmitra/shared-utils/src/LanguageProvider"

const navigation = [
  { href: "/dashboard", label: "dashboard", icon: "▦" },
  { href: "/orders", label: "orders", icon: "▤" },
  { href: "/products", label: "products", icon: "□" },
  { href: "/pricing", label: "shop pricing", icon: "₹" },
  { href: "/customers", label: "customers", icon: "♙" },
  { href: "/delivery", label: "delivery", icon: "⌁" },
  { href: "/payments", label: "payments", icon: "◫" },
  { href: "/settings", label: "settings", icon: "⚙" },
]

type StoredUser = { roles?: unknown; childAdminPermissions?: unknown }

function storedAccount(): { roles: string[]; permissions: string[] } {
  try {
    const user = JSON.parse(localStorage.getItem("farmmitra_user") || "null") as StoredUser | null
    return {
      roles: Array.isArray(user?.roles) ? user.roles.filter((role): role is string => typeof role === "string") : [],
      permissions: Array.isArray(user?.childAdminPermissions)
        ? user.childAdminPermissions.filter((permission): permission is string => typeof permission === "string")
        : [],
    }
  } catch {
    return { roles: [], permissions: [] }
  }
}

export function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { language } = useLanguage()
  const [account, setAccount] = useState<{ roles: string[]; permissions: string[] }>({ roles: [], permissions: [] })

  useEffect(() => { setAccount(storedAccount()) }, [])

  const visibleNavigation = account.roles.includes("CHILD_ADMIN")
    ? [
        { href: "/child-admin", label: "Read-only dashboard", icon: "▦" },
        ...(account.permissions.includes("catalog.products.read") ? [{ href: "/child-admin/products", label: "products", icon: "□" }] : []),
        ...(account.permissions.includes("catalog.prices.read") ? [{ href: "/child-admin/pricing", label: "shop pricing", icon: "₹" }] : []),
        ...(account.permissions.includes("users.read") ? [{ href: "/child-admin/customers", label: "customers", icon: "♙" }] : []),
        ...(account.permissions.includes("orders.read") ? [{ href: "/child-admin/orders", label: "orders", icon: "▤" }] : []),
      ]
    : [...navigation, ...(account.roles.includes("SUPER_ADMIN") ? [{ href: "/child-admins", label: "Child Admins", icon: "♙" }] : [])]

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="logo">RF</div>
        <div>
          <strong>Rawat Farm</strong>
          <span>Admin Operations</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Rawat Farm administration">
        {visibleNavigation.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <button
              className={`nav-item${active ? " active" : ""}`}
              key={item.href}
              aria-current={active ? "page" : undefined}
              onClick={() => router.push(item.href)}
            >
              {item.icon} {translate(item.label, language)}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}