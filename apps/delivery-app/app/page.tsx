"use client"

import { useEffect, useMemo, useState } from "react"
import { api, tokenKey } from "./lib/api"

type Payment = { id: string; amount: string | number; method: string; status: string; referenceNumber?: string | null; receivedAt?: string | null; order?: { orderNumber: string; totalAmount: string | number } | null; vendor?: { name: string } | null }
type PaymentSummary = { orderTotal: number; collected: number; outstanding: number; cashCollected: number; upiCollected: number; status: string; daysOutstanding: number; overdue: boolean; lastPaymentAt?: string | null }
type Delivery = { id: string; status: string; deliveryAddress: string; scheduledAt?: string | null; assignments?: { userId: string; status: string }[]; order: { id: string; orderNumber: string; status: string; totalAmount: string | number; customerId?: string | null; items: { productNameSnapshot?: string | null; orderedQuantity: string | number; unitSnapshot?: string | null; unitPrice?: string | number; lineTotal?: string | number }[]; payments: Payment[] }; paymentSummary: PaymentSummary }
type Dashboard = { deliveries: Delivery[]; today: { assigned: number; pending: number; completed: number; collected: number; cash: number; upi: number; outstanding: number } }
type User = { id: string; name: string; email?: string | null; mobile?: string | null; roles: string[] }
type Tab = "dashboard" | "orders" | "outstanding" | "payments" | "profile"

const money = (value: number | string) => `₹${Number(value || 0).toLocaleString("en-IN")}`
const statusLabel = (value: string) => value.replaceAll("_", " ")
const collected = (payment: Payment) => ["COMPLETED", "CASH_COLLECTED", "UPI_COLLECTED"].includes(payment.status)

function Login({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const [identifier, setIdentifier] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const result = await api<{ accessToken: string; user: User }>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) })
      if (!result.user.roles.some((role) => ["DELIVERY_PARTNER", "DELIVERY_STAFF", "SUPER_ADMIN"].includes(role))) throw new Error("This account is not a delivery partner account")
      localStorage.setItem(tokenKey, result.accessToken)
      localStorage.setItem("farmmitra_delivery_user", JSON.stringify(result.user))
      onLogin(result.accessToken, result.user)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in")
    } finally {
      setBusy(false)
    }
  }

  return <main className="login-page"><section className="login-card"><div className="brand-mark">FM</div><p className="eyebrow">FARMMITRA DELIVERY</p><h1>Ready for today&apos;s route?</h1><p className="muted">Sign in with your existing delivery partner account.</p>{error && <div className="message error">{error}</div>}<form onSubmit={submit}><label>Email or mobile<input required value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" /></label><label>Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label><button disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button></form></section></main>
}

function Stat({ label, value, tone = "" }: { label: string; value: string | number; tone?: string }) {
  return <div className={`stat ${tone}`}><span>{label}</span><strong>{typeof value === "number" ? value.toLocaleString("en-IN") : value}</strong></div>
}

function DeliveryCard({ delivery, onSelect }: { delivery: Delivery; onSelect: () => void }) {
  return <button className="delivery-card" onClick={onSelect}><div className="card-top"><strong>{delivery.order.orderNumber}</strong><span className="badge">{statusLabel(delivery.order.status)}</span></div><p>{delivery.deliveryAddress}</p><div className="card-meta"><span>{delivery.order.items.length} items</span><strong>{money(delivery.order.totalAmount)}</strong></div><div className="balance-line"><span>{delivery.paymentSummary.status.replaceAll("_", " ")}</span><span>Outstanding {money(delivery.paymentSummary.outstanding)}</span></div></button>
}

function Detail({ delivery, token, onBack, onRefresh }: { delivery: Delivery; token: string; onBack: () => void; onRefresh: () => Promise<void> }) {
  const [busy, setBusy] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [method, setMethod] = useState("CASH")
  const [amount, setAmount] = useState(String(delivery.paymentSummary.outstanding))
  const [referenceNumber, setReferenceNumber] = useState("")

  async function action(name: string) {
    setBusy(name)
    setError("")
    try {
      await api(`/api/v1/marketplace/delivery/orders/${delivery.order.id}/${name}`, { method: "POST", body: "{}" }, token)
      setMessage(name === "complete" ? "Delivery completed." : `Delivery ${name}ed.`)
      await onRefresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to update delivery")
    } finally {
      setBusy("")
    }
  }

  async function collectPayment(event: React.FormEvent) {
    event.preventDefault()
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > delivery.paymentSummary.outstanding) {
      setError("Enter an amount greater than zero and no more than the outstanding balance.")
      return
    }
    if (method === "UPI" && !referenceNumber.trim()) {
      setError("A UPI reference ID is required.")
      return
    }
    setBusy("payment")
    setError("")
    try {
      await api(`/api/v1/marketplace/orders/${delivery.order.id}/collect-payment`, { method: "POST", body: JSON.stringify({ method, amount: numericAmount, referenceNumber: method === "UPI" ? referenceNumber.trim() : undefined }) }, token)
      setMessage(`${method} collection recorded: ${money(numericAmount)}`)
      setReferenceNumber("")
      await onRefresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to record payment")
    } finally {
      setBusy("")
    }
  }

  const assignmentStatus = delivery.assignments?.[0]?.status
  const canAccept = delivery.order.status === "ASSIGNED" && assignmentStatus === "ASSIGNED"
  const canStart = assignmentStatus === "ACCEPTED"
  const canComplete = delivery.order.status === "OUT_FOR_DELIVERY"
  return <section className="screen"><button className="back-link" onClick={onBack}>← Back to orders</button><header className="screen-header"><div><p className="eyebrow">DELIVERY DETAIL</p><h1>{delivery.order.orderNumber}</h1></div><span className="badge">{statusLabel(delivery.order.status)}</span></header>{message && <div className="message success">{message}</div>}{error && <div className="message error">{error}</div>}<section className="panel"><h2>Customer & address</h2><p><strong>Customer reference</strong><br />{delivery.order.customerId || "Customer"}</p><p><strong>Delivery address</strong><br />{delivery.deliveryAddress}</p></section><section className="panel"><h2>Items</h2><div className="item-list">{delivery.order.items.map((item, index) => <div className="item-row" key={`${item.productNameSnapshot}-${index}`}><span>{item.productNameSnapshot || "Product"}<small>{item.orderedQuantity} {item.unitSnapshot || ""}</small></span><strong>{item.lineTotal ? money(item.lineTotal) : ""}</strong></div>)}</div></section><section className="panel payment-panel"><h2>Payment summary</h2><div className="summary-grid"><Stat label="Order total" value={money(delivery.paymentSummary.orderTotal)} /><Stat label="Collected" value={money(delivery.paymentSummary.collected)} tone="positive" /><Stat label="Outstanding" value={money(delivery.paymentSummary.outstanding)} tone={delivery.paymentSummary.outstanding ? "warning" : "positive"} /></div><p className="payment-status">{delivery.paymentSummary.status.replaceAll("_", " ")}{delivery.paymentSummary.overdue ? " · OVERDUE" : ""}</p>{delivery.order.payments.filter(collected).length > 0 && <div className="history-list"><h3>Payment history</h3>{delivery.order.payments.filter(collected).map((payment) => <div className="history-row" key={payment.id}><span>{payment.method}<small>{payment.receivedAt ? new Date(payment.receivedAt).toLocaleString("en-IN") : "Recorded"}</small></span><strong>{money(payment.amount)}</strong></div>)}</div>}{delivery.paymentSummary.outstanding > 0 && <form className="collection-form" onSubmit={collectPayment}><h3>Collect payment</h3><label>Amount<input type="number" min="0.01" max={delivery.paymentSummary.outstanding} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><div className="method-toggle"><button type="button" className={method === "CASH" ? "selected" : ""} onClick={() => setMethod("CASH")}>Cash</button><button type="button" className={method === "UPI" ? "selected" : ""} onClick={() => setMethod("UPI")}>UPI</button></div>{method === "UPI" && <label>Transaction/reference ID<input required value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder="UPI reference" /></label>}<button disabled={busy === "payment"}>{busy === "payment" ? "Recording..." : "Record collection"}</button></form>}</section><section className="action-row">{delivery.order.status === "ASSIGNED" && <button disabled={Boolean(busy)} onClick={() => action("accept")}>{busy === "accept" ? "Accepting..." : "Accept"}</button>}{canStart && <button disabled={Boolean(busy)} onClick={() => action("start")}>{busy === "start" ? "Starting..." : "Start delivery"}</button>}{canComplete && <button disabled={Boolean(busy)} onClick={() => action("complete")}>{busy === "complete" ? "Completing..." : "Complete delivery"}</button>}</section></section>
}

export default function DeliveryHome() {
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [tab, setTab] = useState<Tab>("dashboard")
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [payments, setPayments] = useState<{ payments: Payment[]; totals: { total: number; cash: number; upi: number } }>({ payments: [], totals: { total: 0, cash: 0, upi: 0 } })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selected, setSelected] = useState<Delivery | null>(null)
  const [filter, setFilter] = useState("ALL")

  useEffect(() => {
    const savedToken = localStorage.getItem(tokenKey)
    const savedUser = localStorage.getItem("farmmitra_delivery_user")
    if (savedToken) setToken(savedToken)
    if (savedUser) setUser(JSON.parse(savedUser))
  }, [])

  async function load() {
    if (!token) return
    setLoading(true)
    try {
      setError("")
      const [nextDashboard, nextPayments] = await Promise.all([
        api<Dashboard>("/api/v1/marketplace/delivery/dashboard", {}, token),
        api<{ payments: Payment[]; totals: { total: number; cash: number; upi: number } }>("/api/v1/marketplace/delivery/payments", {}, token),
      ])
      setDashboard(nextDashboard)
      setPayments(nextPayments)
      if (selected) setSelected(nextDashboard.deliveries.find((delivery) => delivery.id === selected.id) || null)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Unable to load delivery data"
      setError(message)
      if (/token|authentication|delivery partner/i.test(message)) logout()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (token) load() }, [token])

  function login(nextToken: string, nextUser: User) { setToken(nextToken); setUser(nextUser) }
  function logout() { localStorage.removeItem(tokenKey); localStorage.removeItem("farmmitra_delivery_user"); setToken(null); setUser(null) }

  const visibleDeliveries = useMemo(() => {
    const deliveries = dashboard?.deliveries || []
    if (filter === "PENDING") return deliveries.filter((delivery) => !["DELIVERED", "CANCELLED"].includes(delivery.order.status))
    if (filter === "OUT_FOR_DELIVERY") return deliveries.filter((delivery) => delivery.order.status === "OUT_FOR_DELIVERY")
    if (filter === "DELIVERED") return deliveries.filter((delivery) => delivery.order.status === "DELIVERED")
    if (filter === "PAYMENT_PENDING") return deliveries.filter((delivery) => delivery.paymentSummary.outstanding > 0)
    return deliveries
  }, [dashboard, filter])

  if (!token || !user) return <Login onLogin={login} />
  if (selected) return <Detail delivery={selected} token={token} onBack={() => setSelected(null)} onRefresh={load} />
  if (loading && !dashboard) return <main className="app"><header className="app-header"><div><p className="eyebrow">FARMMITRA DELIVERY</p><h1>Loading your route</h1></div><button className="icon-button" onClick={logout} aria-label="Log out">↪</button></header><section className="panel loading-panel" role="status">Loading assigned deliveries and payment history...</section></main>
  if (error && !dashboard) return <main className="app"><header className="app-header"><div><p className="eyebrow">FARMMITRA DELIVERY</p><h1>Route unavailable</h1></div><button className="icon-button" onClick={logout} aria-label="Log out">↪</button></header><section className="message error" role="alert">{error}<br /><button onClick={load}>Try again</button></section></main>

  return <main className="app"><header className="app-header"><div><p className="eyebrow">FARMMITRA DELIVERY</p><h1>Good morning, {user.name.split(" ")[0]}</h1></div><button className="icon-button" onClick={logout} aria-label="Log out">↪</button></header>{error && <div className="message error">{error}</div>}{tab === "dashboard" && <section className="screen"><div className="today-heading"><div><p className="eyebrow">TODAY</p><h2>Your route at a glance</h2></div><button className="refresh" onClick={load}>Refresh</button></div><div className="stats-grid"><Stat label="Deliveries" value={dashboard?.today.assigned ?? 0} /><Stat label="Completed" value={dashboard?.today.completed ?? 0} tone="positive" /><Stat label="Pending" value={dashboard?.today.pending ?? 0} tone="warning" /><Stat label="Collected" value={money(dashboard?.today.collected ?? 0)} /></div><div className="money-grid"><Stat label="Cash" value={money(dashboard?.today.cash ?? 0)} /><Stat label="UPI" value={money(dashboard?.today.upi ?? 0)} /><Stat label="Outstanding" value={money(dashboard?.today.outstanding ?? 0)} tone="warning" /></div><section className="panel"><div className="section-title"><h2>Recent activity</h2><button onClick={() => setTab("orders")}>View all</button></div>{(dashboard?.deliveries || []).slice(0, 3).map((delivery) => <DeliveryCard key={delivery.id} delivery={delivery} onSelect={() => setSelected(delivery)} />)}{dashboard?.deliveries?.length === 0 && <p className="empty">No deliveries assigned yet.</p>}</section></section>}{tab === "orders" && <section className="screen"><div className="section-title"><div><p className="eyebrow">ASSIGNED ORDERS</p><h2>Your deliveries</h2></div><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">All</option><option value="PENDING">Pending</option><option value="OUT_FOR_DELIVERY">Out for delivery</option><option value="DELIVERED">Delivered</option><option value="PAYMENT_PENDING">Payment pending</option></select></div>{visibleDeliveries.map((delivery) => <DeliveryCard key={delivery.id} delivery={delivery} onSelect={() => setSelected(delivery)} />)}{visibleDeliveries.length === 0 && <p className="empty">No deliveries match this filter.</p>}</section>}{tab === "outstanding" && <section className="screen"><p className="eyebrow">OUTSTANDING</p><h2>Balances to collect</h2>{(dashboard?.deliveries || []).filter((delivery) => delivery.paymentSummary.outstanding > 0).map((delivery) => <DeliveryCard key={delivery.id} delivery={delivery} onSelect={() => setSelected(delivery)} />)}{(dashboard?.deliveries || []).every((delivery) => delivery.paymentSummary.outstanding <= 0) && <p className="empty">Nothing outstanding on your assigned orders.</p>}</section>}{tab === "payments" && <section className="screen"><p className="eyebrow">PAYMENT HISTORY</p><h2>Collections</h2>{payments && <div className="money-grid"><Stat label="Total collected" value={money(payments.totals.total)} /><Stat label="Cash" value={money(payments.totals.cash)} /><Stat label="UPI" value={money(payments.totals.upi)} /></div>}{(payments?.payments || []).map((payment) => <div className="payment-row" key={payment.id}><div><strong>{payment.order?.orderNumber || "Order"}</strong><small>{payment.method} · {payment.receivedAt ? new Date(payment.receivedAt).toLocaleString("en-IN") : "Recorded"}{payment.referenceNumber ? ` · ${payment.referenceNumber}` : ""}</small></div><strong>{money(payment.amount)}</strong></div>)}{payments?.payments.length === 0 && <p className="empty">No payment collections recorded.</p>}</section>}{tab === "profile" && <section className="screen"><p className="eyebrow">PROFILE</p><h2>{user.name}</h2><section className="panel"><p>{user.mobile || user.email || "Contact not provided"}</p><p className="muted">Roles: {user.roles.join(", ")}</p></section><button onClick={logout}>Log out</button></section>}<nav className="bottom-nav">{(["dashboard", "orders", "outstanding", "payments", "profile"] as Tab[]).map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}><span>{item === "dashboard" ? "⌂" : item === "orders" ? "▤" : item === "outstanding" ? "!" : item === "payments" ? "₹" : "●"}</span>{item === "dashboard" ? "Today" : item[0].toUpperCase() + item.slice(1)}</button>)}</nav></main>
}
