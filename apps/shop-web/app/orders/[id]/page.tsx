"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { PortalShell, StateMessage } from "../../components/PortalShell"
import { customerApi } from "../../lib/customer-api"
import { isPaymentCollected } from "../../lib/payment"

type Payment = { status: string; method: string; amount?: string | number; referenceNumber?: string | null; receivedAt?: string | null }
type SubOrder = { id: string; orderNumber: string; status: string; totalAmount: string | number; vendor?: { name: string } | null; items: { productNameSnapshot: string | null; orderedQuantity: string | number }[]; payments: Payment[]; deliveries: { status: string; deliveryAddress: string }[] }
type Master = { orderNumber: string; totalAmount: string | number; deliveryAddress?: { line1?: string; city?: string; state?: string; postalCode?: string } | null; subOrders: SubOrder[] }

const statusFlow = ["PLACED", "CONFIRMED", "PICKING", "PACKED", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED"]
const collectedAmount = (payments: Payment[]) => payments.filter((payment) => isPaymentCollected(payment.status)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
const readableStatus = (status: string) => status === "PICKING" ? "PACKING" : status.replaceAll("_", " ")

export default function OrderDetail() {
	const params = useParams<{ id: string }>()
	const [order, setOrder] = useState<Master | null>(null)
	const [error, setError] = useState("")

	async function loadOrder() {
		setError("")
		try {
			const nextOrder = await customerApi<Master>(`/api/v1/marketplace/master-orders/${params.id}`)
			setOrder({ ...nextOrder, subOrders: nextOrder.subOrders.map((subOrder) => ({ ...subOrder, vendor: subOrder.vendor ? { ...subOrder.vendor, name: "Rawat Farm" } : null })) })
		}
		catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load order") }
	}

	useEffect(() => { loadOrder() }, [params.id])

	return <PortalShell title={order?.orderNumber || "Order details"} subtitle={order ? `Master order total ₹${Number(order.totalAmount).toLocaleString("en-IN")}` : "Your order progress and payment record"} links={[{ label: "Marketplace", href: "/" }, { label: "My orders", href: "/orders" }]}>
		{error && <StateMessage error>{error}<br /><button onClick={loadOrder}>Try again</button></StateMessage>}
		{!order ? !error && <section className="portal-panel skeleton" aria-label="Loading order" /> : <><section className="portal-panel"><h2>Delivery address</h2><p>{order.deliveryAddress ? `${order.deliveryAddress.line1}, ${order.deliveryAddress.city}, ${order.deliveryAddress.state} ${order.deliveryAddress.postalCode}` : "Address unavailable"}</p></section><div className="portal-grid">{order.subOrders.map((subOrder) => { const collected = collectedAmount(subOrder.payments); const total = Number(subOrder.totalAmount); const outstanding = Math.max(total - collected, 0); const paymentStatus = outstanding === 0 ? "PAID" : collected > 0 ? "PARTIALLY_PAID" : "PAYMENT_PENDING"; const currentIndex = statusFlow.indexOf(subOrder.status); return <section className="portal-panel" key={subOrder.id}><div className="section-heading"><div><p className="market-kicker">VENDOR ORDER</p><h2>{subOrder.vendor?.name || "Vendor"}</h2></div><span>{subOrder.orderNumber}</span></div><div className="status-flow" aria-label={`Order status ${readableStatus(subOrder.status)}`}>{statusFlow.map((status, index) => <span className={`status-step ${index < currentIndex ? "complete" : ""} ${status === subOrder.status ? "current" : ""}`} key={status}>{readableStatus(status)}</span>)}</div><div className="detail-summary"><div><span>Order status</span><strong>{readableStatus(subOrder.status)}</strong></div><div><span>Payment status</span><strong>{paymentStatus.replaceAll("_", " ")}</strong></div><div><span>Outstanding</span><strong>₹{outstanding.toLocaleString("en-IN")}</strong></div></div><p className="muted">Delivery: {readableStatus(subOrder.deliveries[0]?.status || "PENDING")}</p><h3>Items</h3><ul>{subOrder.items.map((item, index) => <li key={`${item.productNameSnapshot}-${index}`}>{item.productNameSnapshot || "Product"} × {item.orderedQuantity}</li>)}</ul><h3>Payment history</h3>{subOrder.payments.length === 0 ? <p className="muted">No collection recorded yet. Payment is handled by the vendor or delivery partner.</p> : <ul className="payment-history">{subOrder.payments.map((payment, index) => <li key={`${payment.status}-${index}`}><span>{payment.method} · {payment.status.replaceAll("_", " ")}{payment.referenceNumber ? ` · ${payment.referenceNumber}` : ""}</span><strong>₹{Number(payment.amount || 0).toLocaleString("en-IN")}</strong></li>)}</ul>}<p><strong>Order total</strong><br />₹{total.toLocaleString("en-IN")}</p></section>})}</div></>}
	</PortalShell>
}
