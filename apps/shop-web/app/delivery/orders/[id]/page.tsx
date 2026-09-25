"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { PortalShell, StateMessage } from "../../../components/PortalShell"
import { api } from "../../../lib/api"

type Delivery = { id: string; status: string; deliveryAddress: string; order: { id: string; orderNumber: string; status: string; totalAmount: string | number; customerId?: string | null; items: { productNameSnapshot: string | null; orderedQuantity: string | number; unitSnapshot?: string | null }[]; payments: { status: string; method: string }[] } }

export default function DeliveryOrderDetail() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [delivery, setDelivery] = useState<Delivery | null>(null)
  const [paymentMethod, setPaymentMethod] = useState("NOT_RECEIVED")
  const [amount, setAmount] = useState("0")
  const [referenceNumber, setReferenceNumber] = useState("")
  const [notes, setNotes] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function load() {
    try {
      const nextDelivery = await api<Delivery>(`/api/v1/marketplace/delivery/orders/${params.id}`)
      setDelivery(nextDelivery)
      const total = Number(nextDelivery.order.totalAmount || 0)
      setAmount(String(total))
      if (nextDelivery.order.payments.length > 0) {
        const latest = nextDelivery.order.payments[nextDelivery.order.payments.length - 1]
        const method = latest.method === "CASH" ? "CASH" : latest.method === "UPI" ? "UPI" : latest.method === "PAID_ONLINE" ? "PAID_ONLINE" : "NOT_RECEIVED"
        setPaymentMethod(method)
      } else {
        setPaymentMethod("NOT_RECEIVED")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load delivery")
    }
  }

  useEffect(() => { load() }, [params.id])

  async function action(name: string, body?: object) {
    try {
      await api(`/api/v1/marketplace/delivery/orders/${params.id}/${name}`, { method: "POST", body: JSON.stringify(body || {}) })
      setMessage(name === "complete" ? "Delivery and payment status updated." : `Delivery ${name}ed.`)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update delivery")
    }
  }

  if (!delivery) return <PortalShell title="Delivery details" links={[{ label: "Dashboard", href: "/delivery/dashboard" }, { label: "Deliveries", href: "/delivery/orders" }]}>{error ? <StateMessage error>{error}</StateMessage> : <StateMessage>Loading delivery...</StateMessage>}</PortalShell>

  const done = delivery.order.status === "DELIVERED"
  const totalAmount = Number(delivery.order.totalAmount || 0)

  return <PortalShell title={delivery.order.orderNumber} subtitle="Delivery and payment collection remain separate statuses." links={[{ label: "Dashboard", href: "/delivery/dashboard" }, { label: "Deliveries", href: "/delivery/orders" }]}>{message && <StateMessage>{message}</StateMessage>}{error && <StateMessage error>{error}</StateMessage>}<div className="portal-grid"><section className="portal-panel"><h2>Customer delivery</h2><p><strong>Address</strong><br />{delivery.deliveryAddress}</p><p><strong>Amount</strong><br />₹{totalAmount.toLocaleString("en-IN")}</p><p><strong>Delivery status</strong><br /><span className="status-badge">{delivery.order.status.replaceAll("_", " ")}</span></p>{delivery.order.status === "ASSIGNED" && <><button className="primary" onClick={() => action("accept")}>Accept delivery</button><button className="primary" onClick={() => action("start")}>Start delivery</button></>}</section>{delivery.order.items.length > 0 && <section className="portal-panel"><h2>Products</h2><table className="portal-table"><thead><tr><th>Product</th><th>Quantity</th></tr></thead><tbody>{delivery.order.items.map((item) => <tr key={item.productNameSnapshot || "product"}><td>{item.productNameSnapshot || "Product"}</td><td>{item.orderedQuantity} {item.unitSnapshot || ""}</td></tr>)}</tbody></table></section>}{delivery.order.status === "OUT_FOR_DELIVERY" && <section className="portal-panel"><h2>Complete delivery</h2><div className="portal-stack"><label><span>Payment received</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="PAID_ONLINE">Already paid online</option><option value="CASH">Cash collected</option><option value="UPI">UPI collected</option><option value="NOT_RECEIVED">Payment not received</option></select></label>{(paymentMethod === "CASH" || paymentMethod === "UPI") && <><label><span>Amount</span><input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>{paymentMethod === "UPI" && <label><span>Transaction / reference ID</span><input type="text" value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} placeholder="UPI ref" /></label>}</>}{paymentMethod === "NOT_RECEIVED" && <label><span>Notes</span><input type="text" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional notes" /></label>}<button className="primary" onClick={() => action("complete", { payment: paymentMethod, amount: paymentMethod === "NOT_RECEIVED" ? undefined : Number(amount || totalAmount), referenceNumber: paymentMethod === "UPI" ? referenceNumber : undefined, notes: notes || undefined })}>Mark delivered</button></div></section>}{done && <section className="portal-panel"><h2>Completed</h2>{delivery.order.payments.length > 0 ? <p>Payment recorded: {delivery.order.payments[delivery.order.payments.length - 1].status}</p> : <p>Delivery marked delivered. No payment was recorded.</p>}</section>}<button className="secondary" onClick={() => router.push("/delivery/orders")}>Back to deliveries</button></div></PortalShell>
}
