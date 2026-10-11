"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { clearAdminSession, fetchAdminJson, formatCurrency } from "../lib/admin-api"
import { AdminSidebar } from "../components/AdminSidebar"

type Order = {
  id: string
  orderNumber: string
  status: string
  totalAmount: number | string
  orderDate?: string | null
  shop?: { name?: string | null } | null
  customerId?: string | null
  masterOrder?: { customer?: { name?: string | null } | null } | null
}

type PaymentRecord = {
  id: string
  amount: number | string
  method: string
  status: string
  order?: { id?: string; totalAmount?: number | string } | null
}

type DeliveryPartner = { user: { id: string; status?: string; roles?: Array<{ role?: { name?: string } }> }; isActive?: boolean }
type Customer = { roles?: string[] }

export default function DashboardPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [deliveryPartners, setDeliveryPartners] = useState<DeliveryPartner[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setLoadError("")
      try {
        const firstPage = await fetchAdminJson<{ items: Order[]; pagination?: { totalPages?: number } }>('/api/v1/orders?page=1&pageSize=100&business=rawat-farm')
        const remainingPages = await Promise.all(Array.from(
          { length: Math.max(0, (firstPage.pagination?.totalPages ?? 1) - 1) },
          (_, index) => fetchAdminJson<{ items: Order[] }>(`/api/v1/orders?page=${index + 2}&pageSize=100&business=rawat-farm`),
        ))
        const [orderData, paymentData, partnerData, userData] = await Promise.all([
          Promise.resolve({ items: [...firstPage.items, ...remainingPages.flatMap((page) => page.items)] }),
          fetchAdminJson<PaymentRecord[]>('/api/v1/marketplace/admin/payments?business=rawat-farm'),
          fetchAdminJson<DeliveryPartner[]>('/api/v1/marketplace/admin/delivery-partners'),
          fetchAdminJson<Customer[]>('/api/v1/users'),
        ])
        setOrders(orderData.items ?? [])
        setPayments(paymentData ?? [])
        setDeliveryPartners(partnerData ?? [])
        setCustomers(userData.filter((user) => user.roles?.includes("CUSTOMER")))
      } catch (error) {
        console.error(error)
        setLoadError(error instanceof Error ? error.message : "Unable to load dashboard data.")
        if (typeof window !== "undefined" && error instanceof Error && error.message.includes("session")) {
          clearAdminSession()
          router.push("/")
        }
      } finally {
        setLoading(false)
      }
    }

    void loadData()
  }, [router, reloadKey])

  const paymentByOrder = useMemo(() => {
    const map = new Map<string, number>()
    for (const payment of payments) {
      if (!["COMPLETED", "CASH_COLLECTED", "UPI_COLLECTED"].includes(payment.status)) continue
      const orderId = payment.order?.id ?? ""
      if (!orderId) continue
      map.set(orderId, (map.get(orderId) ?? 0) + Number(payment.amount ?? 0))
    }
    return map
  }, [payments])

  const totalCollected = payments.filter((payment) => ["COMPLETED", "CASH_COLLECTED", "UPI_COLLECTED"].includes(payment.status)).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
  const outstanding = orders.reduce((sum, order) => sum + Math.max(0, Number(order.totalAmount ?? 0) - (paymentByOrder.get(order.id) ?? 0)), 0)
  const indianDateKey = (date: Date) => {
    const parts = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date)
    return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`
  }
  const today = indianDateKey(new Date())
  const todaysOrdersList = orders.filter((order) => order.orderDate && indianDateKey(new Date(order.orderDate)) === today)
  const todaysOrders = todaysOrdersList.length
  const todaysSales = todaysOrdersList.reduce((sum, order) => sum + Number(order.totalAmount ?? 0), 0)
  const pendingOrders = orders.filter((order) => order.status === "PLACED").length
  const ordersBeingPrepared = orders.filter((order) => ["CONFIRMED", "PICKING"].includes(order.status)).length
  const readyForAssignment = orders.filter((order) => order.status === "PACKED").length
  const outForDelivery = orders.filter((order) => order.status === "OUT_FOR_DELIVERY").length
  const delivered = orders.filter((order) => order.status === "DELIVERED").length
  const paymentPending = orders.filter((order) => Number(order.totalAmount ?? 0) > (paymentByOrder.get(order.id) ?? 0) && order.status !== "DELIVERED").length
  const cashCollected = payments.filter((payment) => payment.method === "CASH" && ["COMPLETED", "CASH_COLLECTED"].includes(payment.status)).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
  const upiCollected = payments.filter((payment) => payment.method === "UPI" && ["COMPLETED", "UPI_COLLECTED"].includes(payment.status)).reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0)
  const activeDeliveryGuys = new Set(deliveryPartners.filter((partner) => partner.isActive !== false && partner.user.status === "ACTIVE" && partner.user.roles?.some(({ role }) => ["DELIVERY_PARTNER", "DELIVERY_STAFF"].includes(role?.name ?? ""))).map((partner) => partner.user.id)).size

  const openOrders = (status?: string) => {
    const next = status ? `?status=${encodeURIComponent(status)}` : ""
    router.push(`/orders${next}`)
  }

  return (
    <main className="app-shell">
      <AdminSidebar />

      <section className="main-content">
        <header className="topbar">
          <div>
            <h1>Rawat Farm Operations</h1>
            <p>Live order, delivery, and payment overview</p>
          </div>
          <button className="top-logout" onClick={() => { clearAdminSession(); router.push("/") }}>Logout</button>
        </header>

        <div className="content">
          {loadError ? (
            <div className="message error" role="alert">
              {loadError}
              <button className="secondary-action" onClick={() => setReloadKey((current) => current + 1)}>Try again</button>
            </div>
          ) : (
            <>
          <div className="stats-grid">
            <button className="stat-card" style={{ border: "1px solid #e2e8e3", textAlign: "left", width: "100%" }} onClick={() => router.push("/customers")}>
              <div className="stat-icon">C</div>
              <div><span>Total Customers</span><strong>{customers.length}</strong><small>Rawat Farm customers</small></div>
            </button>

            <button className="stat-card" style={{ border: "1px solid #e2e8e3", textAlign: "left", width: "100%" }} onClick={() => router.push("/orders")}>
              <div className="stat-icon green">₹</div>
              <div><span>Today&apos;s Sales</span><strong>{formatCurrency(todaysSales)}</strong><small>{todaysOrders} orders today</small></div>
            </button>

            <button className="stat-card" style={{ border: "1px solid #e2e8e3", textAlign: "left", width: "100%" }} onClick={() => openOrders()}>
              <div className="stat-icon">#</div>
              <div>
                <span>Today's Orders</span>
                <strong>{todaysOrders}</strong>
                <small>Placed today</small>
              </div>
            </button>

            <button className="stat-card" style={{ border: "1px solid #e2e8e3", textAlign: "left", width: "100%" }} onClick={() => openOrders("PLACED")}>
              <div className="stat-icon orange">N</div>
              <div>
                <span>Pending Orders</span>
                <strong>{pendingOrders}</strong>
                <small>Awaiting confirmation</small>
              </div>
            </button>

            <button className="stat-card" style={{ border: "1px solid #e2e8e3", textAlign: "left", width: "100%" }} onClick={() => openOrders("PICKING")}>
              <div className="stat-icon blue">P</div>
              <div>
                <span>Orders Being Prepared</span>
                <strong>{ordersBeingPrepared}</strong>
                <small>Confirmed or picking</small>
              </div>
            </button>

            <button className="stat-card" style={{ border: "1px solid #e2e8e3", textAlign: "left", width: "100%" }} onClick={() => openOrders("PACKED")}>
              <div className="stat-icon green">A</div>
              <div>
                <span>Ready for Delivery</span>
                <strong>{readyForAssignment}</strong>
                <small>Awaiting partner</small>
              </div>
            </button>

            <button className="stat-card" style={{ border: "1px solid #e2e8e3", textAlign: "left", width: "100%" }} onClick={() => openOrders("OUT_FOR_DELIVERY")}>
              <div className="stat-icon blue">O</div>
              <div>
                <span>Out for Delivery</span>
                <strong>{outForDelivery}</strong>
                <small>In transit</small>
              </div>
            </button>

            <button className="stat-card" style={{ border: "1px solid #e2e8e3", textAlign: "left", width: "100%" }} onClick={() => openOrders("DELIVERED")}>
              <div className="stat-icon green">D</div>
              <div>
                <span>Delivered</span>
                <strong>{delivered}</strong>
                <small>Completed</small>
              </div>
            </button>

            <button className="stat-card" style={{ border: "1px solid #e2e8e3", textAlign: "left", width: "100%" }} onClick={() => openOrders("PAYMENT_PENDING")}>
              <div className="stat-icon orange">₹</div>
              <div>
                <span>Payment Pending</span>
                <strong>{paymentPending}</strong>
                <small>Outstanding</small>
              </div>
            </button>

            <button className="stat-card" style={{ border: "1px solid #e2e8e3", textAlign: "left", width: "100%" }} onClick={() => router.push("/payments")}>
              <div className="stat-icon green">C</div>
              <div>
                <span>Cash Collected</span>
                <strong>{formatCurrency(cashCollected)}</strong>
                <small>Cash totals</small>
              </div>
            </button>

            <button className="stat-card" style={{ border: "1px solid #e2e8e3", textAlign: "left", width: "100%" }} onClick={() => router.push("/payments")}>
              <div className="stat-icon blue">U</div>
              <div>
                <span>UPI Collected</span>
                <strong>{formatCurrency(upiCollected)}</strong>
                <small>UPI totals</small>
              </div>
            </button>

            <button className="stat-card" style={{ border: "1px solid #e2e8e3", textAlign: "left", width: "100%" }} onClick={() => router.push("/payments")}>
              <div className="stat-icon green">₹</div>
              <div>
                <span>Total Collected Amount</span>
                <strong>{formatCurrency(totalCollected)}</strong>
                <small>Collected</small>
              </div>
            </button>

            <button className="stat-card" style={{ border: "1px solid #e2e8e3", textAlign: "left", width: "100%" }} onClick={() => router.push("/orders")}>
              <div className="stat-icon orange">O</div>
              <div>
                <span>Outstanding Amount</span>
                <strong>{formatCurrency(outstanding)}</strong>
                <small>Due</small>
              </div>
            </button>

            <button className="stat-card" style={{ border: "1px solid #e2e8e3", textAlign: "left", width: "100%" }} onClick={() => router.push("/delivery")}>
              <div className="stat-icon blue">D</div>
              <div>
                <span>Active Delivery Guys</span>
                <strong>{activeDeliveryGuys}</strong>
                <small>Rawat Farm delivery team</small>
              </div>
            </button>
          </div>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h3>Recent orders</h3>
                <p>Latest Rawat Farm orders.</p>
              </div>
              <button className="view-all" onClick={() => router.push("/orders")}>View all</button>
            </div>

            {loading ? (
              <div className="empty-state">Loading orders...</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Business</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 6).map((order) => (
                      <tr key={order.id} className="clickable-row" onClick={() => router.push(`/orders/${order.id}`)}>
                        <td><strong>{order.orderNumber}</strong></td>
                        <td>{order.masterOrder?.customer?.name || order.customerId || "—"}</td>
                        <td>Rawat Farm</td>
                        <td>{formatCurrency(order.totalAmount)}</td>
                        <td><span className={`status ${order.status.toLowerCase()}`}>{order.status.replaceAll("_", " ")}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
            </>
          )}
        </div>
      </section>
    </main>
  )
}
