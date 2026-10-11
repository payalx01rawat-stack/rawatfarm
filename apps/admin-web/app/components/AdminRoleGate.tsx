"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

type StoredUser = { roles?: unknown; childAdminPermissions?: unknown }

function childAdminState(): { isChildAdmin: boolean; permissions: string[] } {
  try {
    const user = JSON.parse(localStorage.getItem("farmmitra_user") || "null") as StoredUser | null
    return {
      isChildAdmin: Array.isArray(user?.roles) && user.roles.includes("CHILD_ADMIN"),
      permissions: Array.isArray(user?.childAdminPermissions)
        ? user.childAdminPermissions.filter((permission): permission is string => typeof permission === "string")
        : [],
    }
  } catch {
    return { isChildAdmin: false, permissions: [] }
  }
}

export function AdminRoleGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname()
  const router = useRouter()
  const [restricted, setRestricted] = useState(false)

  useEffect(() => {
    const { isChildAdmin, permissions } = childAdminState()
    const requiredPermission = pathname.startsWith("/child-admin/products")
      ? "catalog.products.read"
      : pathname.startsWith("/child-admin/pricing")
        ? "catalog.prices.read"
        : pathname.startsWith("/child-admin/customers")
          ? "users.read"
          : pathname.startsWith("/child-admin/orders")
            ? "orders.read"
            : undefined
    const outsideReadOnlyApp = pathname !== "/" && !pathname.startsWith("/child-admin")
    const unassignedResource = Boolean(requiredPermission && !permissions.includes(requiredPermission))
    setRestricted(isChildAdmin && (outsideReadOnlyApp || unassignedResource))
    if (isChildAdmin && (outsideReadOnlyApp || unassignedResource)) router.replace("/child-admin")
  }, [pathname, router])

  return restricted ? <main className="app-shell"><section className="main-content"><div className="empty-state">Opening Child Admin dashboard...</div></section></main> : children
}