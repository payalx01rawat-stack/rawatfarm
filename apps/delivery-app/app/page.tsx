"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { api, tokenKey } from "./lib/api"
import { formatLocalizedDate } from "@farmmitra/shared-utils"
import { languageAfterLogin, notifyLanguageSessionAuthenticated } from "@farmmitra/shared-utils/src/language-session"
import { useLanguage, useTranslation } from "@farmmitra/shared-utils/src/LanguageProvider"

type Payment = { id: string; amount: string | number; method: string; status: string; referenceNumber?: string | null; receivedAt?: string | null; order?: { orderNumber: string; totalAmount: string | number } | null; vendor?: { name: string } | null }
type PaymentSummary = { orderTotal: number; collected: number; outstanding: number; cashCollected: number; upiCollected: number; status: string; daysOutstanding: number; overdue: boolean; lastPaymentAt?: string | null }
type OrderForCollection = Delivery["order"] & { deliveryAddressSnapshot?: string | null; paymentSummary: PaymentSummary; deliveries?: Delivery[] }
type Delivery = { id: string; status: string; deliveryAddress: string; scheduledAt?: string | null; assignments?: { userId: string; status: string; user?: { name: string } }[]; order: { id: string; orderNumber: string; status: string; totalAmount: string | number; customerId?: string | null; deliveryAddressSnapshot?: string | null; vendor?: { name: string; upiId?: string | null; paymentDisplayName?: string | null; upiCollectionEnabled?: boolean } | null; items: { productNameSnapshot?: string | null; orderedQuantity: string | number; unitSnapshot?: string | null; unitPrice?: string | number; lineTotal?: string | number }[]; payments: Payment[] }; paymentSummary: PaymentSummary }
type Dashboard = { deliveries: Delivery[]; today: { assigned: number; pending: number; completed: number; collected: number; cash: number; upi: number; outstanding: number } }
type User = { id: string; name: string; email?: string | null; mobile?: string | null; roles: string[]; preferredLanguage?: string }
type Tab = "dashboard" | "orders" | "outstanding" | "collect" | "payments" | "profile"

const money = (value: number | string) => `₹${Number(value || 0).toLocaleString("en-IN")}`
const statusLabel = (value: string) => value.replaceAll("_", " ")
const collected = (payment: Payment) => ["COMPLETED", "CASH_COLLECTED", "UPI_COLLECTED"].includes(payment.status)

function Login({ onLogin }: { onLogin: (token: string, user: User) => void }) {
  const { setLanguage } = useLanguage()
  const { t } = useTranslation()
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
      if (!result.user.roles.some((role) => ["DELIVERY_PARTNER", "DELIVERY_STAFF", "SUPER_ADMIN"].includes(role))) throw new Error(t("thisDeliveryAccount"))
      localStorage.setItem(tokenKey, result.accessToken)
      localStorage.setItem("farmmitra_delivery_user", JSON.stringify(result.user))
      const preferredLanguage = languageAfterLogin(result.user.preferredLanguage)
      if (preferredLanguage) setLanguage(preferredLanguage)
      notifyLanguageSessionAuthenticated()
      onLogin(result.accessToken, result.user)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("unableToSignIn"))
    } finally {
      setBusy(false)
    }
  }

  return <main className="login-page"><section className="login-card"><div className="brand-mark">RF</div><p className="eyebrow">RAWAT FARM DELIVERY</p><h1>{t("readyForRoute")}</h1><p className="muted">{t("deliveryAccountSignIn")}</p>{error && <div className="message error">{error}</div>}<form onSubmit={submit}><label>{t("emailOrMobile")}<input required value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" /></label><label>{t("password")}<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label><button disabled={busy}>{busy ? t("signingIn") : t("signIn")}</button></form></section></main>
}

function Stat({ label, value, tone = "" }: { label: string; value: string | number; tone?: string }) {
  return <div className={`stat ${tone}`}><span>{label}</span><strong>{typeof value === "number" ? value.toLocaleString("en-IN") : value}</strong></div>
}

function DeliveryCard({ delivery, onSelect }: { delivery: Delivery; onSelect: () => void }) {
  return <button className="delivery-card" onClick={onSelect}><div className="card-top"><strong>{delivery.order.orderNumber}</strong><span className="badge">{statusLabel(delivery.order.status)}</span></div><p>{delivery.deliveryAddress}</p>{delivery.order.vendor?.upiCollectionEnabled && delivery.order.vendor.paymentDisplayName === "Rawat Farm" && delivery.order.vendor.upiId && <p>Rawat Farm UPI · <strong>{delivery.order.vendor.upiId}</strong></p>}<div className="card-meta"><span>{delivery.order.items.length} items</span><strong>{money(delivery.order.totalAmount)}</strong></div><div className="balance-line"><span>{delivery.paymentSummary.status.replaceAll("_", " ")}</span><span>Outstanding {money(delivery.paymentSummary.outstanding)}</span></div></button>
}

function Detail({ delivery, token, onBack, onRefresh, onCollectionUpdate, collectionOnly = false }: { delivery: Delivery; token: string; onBack: () => void; onRefresh: () => Promise<void>; onCollectionUpdate: (summary: PaymentSummary, payments: Payment[], replaceHistory: boolean) => void; collectionOnly?: boolean }) {
  const { language } = useLanguage()
  const { t } = useTranslation()
  const [busy, setBusy] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [method, setMethod] = useState("CASH")
  const [amount, setAmount] = useState(String(delivery.paymentSummary.outstanding))
  const [referenceNumber, setReferenceNumber] = useState("")
  const collectionRequest = useRef<{ fingerprint: string; key: string } | null>(null)

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
    if (method === "UPI" && (!delivery.order.vendor?.upiCollectionEnabled || delivery.order.vendor.paymentDisplayName !== "Rawat Farm" || !delivery.order.vendor.upiId)) {
      setError("Rawat Farm UPI is not configured. Use Cash until the confirmed UPI ID is saved in Admin Settings.")
      return
    }
    const numericAmount = Number(amount)
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount > delivery.paymentSummary.outstanding) {
      setError(t("enterAmountWithinOutstanding"))
      return
    }
    if (method === "UPI" && !referenceNumber.trim()) {
      setError(t("upiReferenceRequired"))
      return
    }
    setBusy("payment")
    setError("")
    try {
      const input = { method, amount: numericAmount, referenceNumber: method === "UPI" ? referenceNumber.trim() : undefined }
      const fingerprint = JSON.stringify({ orderId: delivery.order.id, input })
      const key = collectionRequest.current?.fingerprint === fingerprint ? collectionRequest.current.key : crypto.randomUUID()
      collectionRequest.current = { fingerprint, key }
      const result = await api<{ payment?: Payment; payments?: Payment[]; summary: PaymentSummary; idempotent?: boolean }>(`/api/v1/marketplace/orders/${delivery.order.id}/collect-payment`, { method: "POST", headers: { "idempotency-key": key }, body: JSON.stringify(input) }, token)
      collectionRequest.current = null
      onCollectionUpdate(result.summary, result.idempotent ? result.payments || [] : result.payment ? [result.payment] : [], Boolean(result.idempotent))
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
  const rawatFarmUpiEnabled = Boolean(delivery.order.vendor?.upiCollectionEnabled && delivery.order.vendor.paymentDisplayName === "Rawat Farm" && delivery.order.vendor.upiId)
  useEffect(() => {
    if (method === "UPI" && !rawatFarmUpiEnabled) setError(t("upiNotConfigured"))
  }, [method, rawatFarmUpiEnabled, t])
  return <section className="screen"><button className="back-link" onClick={onBack}>← {t("backToOrders")}</button><header className="screen-header"><div><p className="eyebrow">{collectionOnly ? t("collectPayment") : t("deliveryDetail")}</p><h1>{delivery.order.orderNumber}</h1></div><span className="badge">{statusLabel(delivery.order.status)}</span></header>{message && <div className="message success">{message}</div>}{error && <div className="message error">{error}</div>}<section className="panel"><h2>{t("customerAndAddress")}</h2><p><strong>{t("customerSummary")}</strong><br />{delivery.order.customerId || "Customer"}</p><p><strong>{t("deliveryAddress")}</strong><br />{delivery.deliveryAddress}</p></section><section className="panel"><h2>{t("items")}</h2><div className="item-list">{delivery.order.items.map((item, index) => <div className="item-row" key={`${item.productNameSnapshot}-${index}`}><span>{item.productNameSnapshot || t("product")}<small>{item.orderedQuantity} {item.unitSnapshot || ""}</small></span><strong>{item.lineTotal ? money(item.lineTotal) : ""}</strong></div>)}</div></section><section className="panel payment-panel"><h2>{t("paymentSummary")}</h2><div className="summary-grid"><Stat label={t("orderTotal")} value={money(delivery.paymentSummary.orderTotal)} /><Stat label={t("collected")} value={money(delivery.paymentSummary.collected)} tone="positive" /><Stat label={t("outstanding")} value={money(delivery.paymentSummary.outstanding)} tone={delivery.paymentSummary.outstanding ? "warning" : "positive"} /></div><p className="payment-status">{delivery.paymentSummary.status.replaceAll("_", " ")}{delivery.paymentSummary.overdue ? " · OVERDUE" : ""}</p>{delivery.order.payments.filter(collected).length > 0 && <div className="history-list"><h3>{t("paymentHistoryHeading")}</h3>{delivery.order.payments.filter(collected).map((payment) => <div className="history-row" key={payment.id}><span>{payment.method}<small>{payment.receivedAt ? formatLocalizedDate(payment.receivedAt, language, { dateStyle: "medium", timeStyle: "medium" }) : t("recorded")}</small></span><strong>{money(payment.amount)}</strong></div>)}</div>}{delivery.paymentSummary.outstanding > 0 && <form className="collection-form" onSubmit={collectPayment}><h3>{t("collectPayment")}</h3><label>{t("amount")}<input type="number" min="0.01" max={delivery.paymentSummary.outstanding} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><div className="method-toggle"><button type="button" className={method === "CASH" ? "selected" : ""} onClick={() => setMethod("CASH")}>{t("cash")}</button><button type="button" className={method === "UPI" ? "selected" : ""} onClick={() => setMethod("UPI")}>{t("upi")}</button></div>{method === "UPI" && <label>{t("transactionReferenceId")}<input required value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder={t("upiReference")} /></label>}<button disabled={busy === "payment"}>{busy === "payment" ? t("recording") : t("recordCollection")}</button></form>}</section>{!collectionOnly && <section className="action-row">{delivery.order.status === "ASSIGNED" && <button disabled={Boolean(busy)} onClick={() => action("accept")}>{busy === "accept" ? t("accepting") : t("accept")}</button>}{canStart && <button disabled={Boolean(busy)} onClick={() => action("start")}>{busy === "start" ? t("startingDelivery") : t("startDelivery")}</button>}{canComplete && <button disabled={Boolean(busy)} onClick={() => action("complete")}>{busy === "complete" ? t("completingDelivery") : t("completeDelivery")}</button>}</section>}</section>
}

export default function DeliveryHome() {
  const { language } = useLanguage()
  const { t } = useTranslation()
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [tab, setTab] = useState<Tab>("dashboard")
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [collectibleOrders, setCollectibleOrders] = useState<OrderForCollection[]>([])
  const [payments, setPayments] = useState<{ payments: Payment[]; totals: { total: number; cash: number; upi: number } }>({ payments: [], totals: { total: 0, cash: 0, upi: 0 } })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [collectionError, setCollectionError] = useState("")
  const [selected, setSelected] = useState<Delivery | null>(null)
  const [collectionOnly, setCollectionOnly] = useState(false)
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
      const [dashboardResult, paymentsResult, collectibleResult] = await Promise.allSettled([
        api<Dashboard>("/api/v1/marketplace/delivery/dashboard", {}, token),
        api<{ payments: Payment[]; totals: { total: number; cash: number; upi: number } }>("/api/v1/marketplace/delivery/payments", {}, token),
        api<OrderForCollection[]>("/api/v1/marketplace/delivery/collectible-orders", {}, token),
      ])
      if (dashboardResult.status === "rejected") throw dashboardResult.reason
      if (paymentsResult.status === "rejected") throw paymentsResult.reason
      const nextDashboard = dashboardResult.value
      const nextPayments = paymentsResult.value
      setDashboard(nextDashboard)
      setPayments(nextPayments)
      if (collectibleResult.status === "fulfilled") {
        setCollectibleOrders(collectibleResult.value)
        setCollectionError("")
      } else {
        setCollectibleOrders([])
        setCollectionError(collectibleResult.reason instanceof Error ? collectibleResult.reason.message : t("collectionUnavailable"))
      }
      if (selected && !collectionOnly) setSelected(nextDashboard.deliveries.find((delivery) => delivery.id === selected.id) || null)
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
  if (selected) return <Detail delivery={selected} token={token} onBack={() => setSelected(null)} onRefresh={load} onCollectionUpdate={(summary, nextPayments, replaceHistory) => setSelected((current) => current ? { ...current, paymentSummary: summary, order: { ...current.order, payments: replaceHistory ? nextPayments : [...current.order.payments, ...nextPayments] } } : current)} collectionOnly={collectionOnly} />
  if (loading && !dashboard) return <main className="app"><header className="app-header"><div><p className="eyebrow">RAWAT FARM DELIVERY</p><h1>{t("loadingYourRoute")}</h1></div><button className="icon-button" onClick={logout} aria-label={t("logout")}>↪</button></header><section className="panel loading-panel" role="status">{t("loadingYourRoute")}</section></main>
  if (error && !dashboard) return <main className="app"><header className="app-header"><div><p className="eyebrow">RAWAT FARM DELIVERY</p><h1>{t("routeUnavailable")}</h1></div><button className="icon-button" onClick={logout} aria-label={t("logout")}>↪</button></header><section className="message error" role="alert">{error}<br /><button onClick={load}>{t("tryAgain")}</button></section></main>

  return <main className="app"><header className="app-header"><div><p className="eyebrow">RAWAT FARM DELIVERY</p><h1>{t("goodMorning", { name: user.name.split(" ")[0] || user.name })}</h1></div><button className="icon-button" onClick={logout} aria-label={t("logout")}>↪</button></header>{error && <div className="message error">{error}</div>}{tab === "collect" && collectionError && <div className="message error">{t("collectionUnavailable")}: {collectionError}</div>}{tab === "dashboard" && <section className="screen"><div className="today-heading"><div><p className="eyebrow">{t("today")}</p><h2>{t("yourRouteAtAGlance")}</h2></div><button className="refresh" onClick={load}>{t("refresh")}</button></div><div className="stats-grid"><Stat label={t("deliveries")} value={dashboard?.today.assigned ?? 0} /><Stat label={t("completed")} value={dashboard?.today.completed ?? 0} tone="positive" /><Stat label={t("pending")} value={dashboard?.today.pending ?? 0} tone="warning" /><Stat label={t("collected")} value={money(dashboard?.today.collected ?? 0)} /></div><div className="money-grid"><Stat label={t("cash")} value={money(dashboard?.today.cash ?? 0)} /><Stat label={t("upi")} value={money(dashboard?.today.upi ?? 0)} /><Stat label={t("outstanding")} value={money(dashboard?.today.outstanding ?? 0)} tone="warning" /></div><section className="panel"><div className="section-title"><h2>{t("recentActivity")}</h2><button onClick={() => setTab("orders")}>{t("viewAll")}</button></div>{(dashboard?.deliveries || []).slice(0, 3).map((delivery) => <DeliveryCard key={delivery.id} delivery={delivery} onSelect={() => { setCollectionOnly(false); setSelected(delivery) }} />)}{dashboard?.deliveries?.length === 0 && <p className="empty">{t("noDeliveriesAssigned")}</p>}</section></section>}{tab === "orders" && <section className="screen"><div className="section-title"><div><p className="eyebrow">{t("assignedOrders")}</p><h2>{t("yourDeliveries")}</h2></div><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">{t("all")}</option><option value="PENDING">{t("pending")}</option><option value="OUT_FOR_DELIVERY">{t("outForDelivery")}</option><option value="DELIVERED">{t("completed")}</option><option value="PAYMENT_PENDING">{t("paymentPending")}</option></select></div>{visibleDeliveries.map((delivery) => <DeliveryCard key={delivery.id} delivery={delivery} onSelect={() => { setCollectionOnly(false); setSelected(delivery) }} />)}{visibleDeliveries.length === 0 && <p className="empty">{t("noDeliveriesMatch")}</p>}</section>}{tab === "outstanding" && <section className="screen"><p className="eyebrow">{t("outstandingBalance")}</p><h2>{t("balancesToCollect")}</h2>{(dashboard?.deliveries || []).filter((delivery) => delivery.paymentSummary.outstanding > 0).map((delivery) => <DeliveryCard key={delivery.id} delivery={delivery} onSelect={() => { setCollectionOnly(false); setSelected(delivery) }} />)}{(dashboard?.deliveries || []).every((delivery) => delivery.paymentSummary.outstanding <= 0) && <p className="empty">{t("nothingOutstanding")}</p>}</section>}{tab === "collect" && <section className="screen"><p className="eyebrow">{t("paymentCollection")}</p><h2>{t("ordersAwaitingPayment")}</h2>{collectibleOrders.map((order) => { const assigned = order.deliveries?.flatMap((delivery) => delivery.assignments || []).map((assignment) => assignment.user?.name).filter(Boolean); const delivery = order.deliveries?.[0]; const selection: Delivery = { id: delivery?.id || "", status: delivery?.status || "", deliveryAddress: delivery?.deliveryAddress || order.deliveryAddressSnapshot || "", assignments: delivery?.assignments || [], order, paymentSummary: order.paymentSummary }; return <button className="delivery-card" key={order.id} onClick={() => { setCollectionOnly(true); setSelected(selection) }}><div className="card-top"><strong>{order.orderNumber}</strong><span className="badge">{statusLabel(order.status)}</span></div><p>{order.deliveryAddressSnapshot || t("deliveryAddress")}</p>{assigned?.length ? <p>{t("assignedTo")}: {assigned.join(", ")}</p> : <p>{t("noDeliveryAssignment")}</p>}<div className="balance-line"><span>{t("outstanding")}</span><strong>{money(order.paymentSummary.outstanding)}</strong></div></button>})}{collectibleOrders.length === 0 && <p className="empty">{t("noCollectibleOrders")}</p>}</section>}{tab === "payments" && <section className="screen"><p className="eyebrow">{t("paymentHistoryHeading")}</p><h2>{t("collectionsHeading")}</h2>{payments && <div className="money-grid"><Stat label={t("totalCollected")} value={money(payments.totals.total)} /><Stat label={t("cash")} value={money(payments.totals.cash)} /><Stat label={t("upi")} value={money(payments.totals.upi)} /></div>}{(payments?.payments || []).map((payment) => <div className="payment-row" key={payment.id}><div><strong>{payment.order?.orderNumber || t("order")}</strong><small>{payment.method} · {payment.receivedAt ? formatLocalizedDate(payment.receivedAt, language, { dateStyle: "medium", timeStyle: "medium" }) : t("recorded")}{payment.referenceNumber ? ` · ${payment.referenceNumber}` : ""}</small></div><strong>{money(payment.amount)}</strong></div>)}{payments?.payments.length === 0 && <p className="empty">{t("noPaymentCollections")}</p>}</section>}{tab === "profile" && <section className="screen"><p className="eyebrow">{t("profile")}</p><h2>{user.name}</h2><section className="panel"><p>{user.mobile || user.email || t("contactNotProvided")}</p><p className="muted">{t("roles")}: {user.roles.join(", ")}</p></section><button onClick={logout}>{t("logout")}</button></section>}<nav className="bottom-nav">{(["dashboard", "orders", "outstanding", "collect", "payments", "profile"] as Tab[]).map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}><span>{item === "dashboard" ? "⌂" : item === "orders" ? "▤" : item === "outstanding" ? "!" : item === "collect" ? "₹" : item === "payments" ? "₹" : "●"}</span>{t(item === "dashboard" ? "today" : item === "orders" ? "orders" : item === "outstanding" ? "outstanding" : item === "collect" ? "paymentCollection" : item === "payments" ? "payments" : "profile")}</button>)}</nav></main>
}
