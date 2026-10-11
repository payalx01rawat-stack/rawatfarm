"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { PortalShell, StateMessage } from "../components/PortalShell"
import { customerApi } from "../lib/customer-api"

type Master = { id: string; orderNumber: string; totalAmount: string | number; createdAt: string; subOrders: { status: string }[] }

export default function Orders() {
	const [orders, setOrders] = useState<Master[]>([])
	const [error, setError] = useState("")
	const [loading, setLoading] = useState(true)
	const router = useRouter()

	async function loadOrders() {
		setLoading(true)
		setError("")
		try {
			setOrders(await customerApi<Master[]>("/api/v1/marketplace/master-orders"))
		} catch (reason) {
			setError(reason instanceof Error ? reason.message : "Unable to load orders")
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => { loadOrders() }, [])

	return <PortalShell title="My orders" subtitle="Track your Rawat Farm orders." links={[{ label: "Shop", href: "/" }, { label: "My orders", href: "/orders" }]}>
		{error && <StateMessage error>{error}<br /><button onClick={loadOrders}>Try again</button></StateMessage>}
		{loading ? <section className="portal-panel skeleton" aria-label="Loading orders" /> : !error && <section className="order-list" aria-label="Your Rawat Farm orders">{orders.length === 0 ? <div className="portal-panel portal-empty"><strong>No orders yet.</strong><br />Your Rawat Farm orders will appear here.</div> : orders.map((order) => <article className="order-card" key={order.id} onClick={() => router.push(`/orders/${order.id}`)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") router.push(`/orders/${order.id}`) }} tabIndex={0} role="link" aria-label={`View order ${order.orderNumber}`}><div><strong>{order.orderNumber}</strong><small>{new Date(order.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}</small></div><span className="status-badge neutral">Rawat Farm</span><strong>₹{Number(order.totalAmount).toLocaleString("en-IN")}</strong><div className="order-vendors">{order.subOrders.map((subOrder, index) => <span className="status-badge" key={`${subOrder.status}-${index}`}>{subOrder.status.replaceAll("_", " ")}</span>)}</div></article>)}</section>}
	</PortalShell>
}
