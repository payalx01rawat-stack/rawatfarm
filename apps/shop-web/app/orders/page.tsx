"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { PortalShell, StateMessage } from "../components/PortalShell"
import { api } from "../lib/api"

type Master = { id: string; orderNumber: string; totalAmount: string | number; createdAt: string; subOrders: { status: string; vendor?: { name: string } | null }[] }
export default function Orders() { const [orders, setOrders] = useState<Master[]>([]); const [error, setError] = useState(""); const router = useRouter(); useEffect(() => { api<Master[]>("/api/v1/marketplace/master-orders").then(setOrders).catch((e) => setError(e instanceof Error ? e.message : "Unable to load orders")) }, []); return <PortalShell title="My orders" subtitle="Track each vendor order inside your master order." links={[{ label: "Marketplace", href: "/" }, { label: "My orders", href: "/orders" }]}>{error && <StateMessage error>{error}</StateMessage>}<section className="portal-panel">{orders.length === 0 ? <div className="portal-empty">No marketplace orders yet.</div> : <table className="portal-table"><thead><tr><th>Master order</th><th>Vendors</th><th>Total</th><th>Statuses</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id} onClick={() => router.push(`/orders/${order.id}`)} style={{ cursor: "pointer" }}><td><strong>{order.orderNumber}</strong><small>{new Date(order.createdAt).toLocaleDateString("en-IN")}</small></td><td>{order.subOrders.map((subOrder) => subOrder.vendor?.name || "Vendor").join(", ")}</td><td>₹{Number(order.totalAmount).toLocaleString("en-IN")}</td><td>{order.subOrders.map((subOrder, index) => <span className="status-badge" key={`${subOrder.status}-${index}`}>{subOrder.status.replaceAll("_", " ")}</span>)}</td></tr>)}</tbody></table>}</section></PortalShell> }
