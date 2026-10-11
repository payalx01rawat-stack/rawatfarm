"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { formatLocalizedCurrency, formatLocalizedDate, type Language } from "@farmmitra/shared-utils"
import { useLanguage, useTranslation } from "@farmmitra/shared-utils/src/LanguageProvider"
import { PortalShell, StateMessage } from "../components/PortalShell"
import { customerApi } from "../lib/customer-api"
const todayInIndia = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())
const shiftDate = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
const money = (value: number | string, language: Language) => formatLocalizedCurrency(value, language)
const dateTime = (value: string, language: Language) => `${formatLocalizedDate(value, language, { dateStyle: "medium" })} · ${formatLocalizedDate(value, language, { timeStyle: "medium" })}`

type LedgerEntry = {
  transactionId: string
  date: string
  description: string
  orderId: string
  orderNumber: string
  debit: number
  credit: number
  balance: number
  method: string | null
  collector: string | null
  referenceNumber: string | null
  status: string
}
type KhataData = {
  customer: { name: string }
  summary: { totalOrderValue: number; totalPaid: number; outstanding: number }
  ledger: {
    summary: { openingBalance: number; totalCharges: number; totalPayments: number; adjustments: number; closingBalance: number }
    transactions: LedgerEntry[]
    pagination: { page: number; pageSize: number; total: number; pages: number }
  }
}

export default function CustomerKhataPage() {
  const router = useRouter()
  const { language } = useLanguage()
  const { t } = useTranslation()
  const [period, setPeriod] = useState("all")
  const [from, setFrom] = useState(todayInIndia())
  const [to, setTo] = useState(todayInIndia())
  const [appliedRange, setAppliedRange] = useState<{ from?: string; to?: string }>({})
  const [page, setPage] = useState(1)
  const [data, setData] = useState<KhataData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: "25" })
    if (appliedRange.from) params.set("from", appliedRange.from)
    if (appliedRange.to) params.set("to", appliedRange.to)
    return params.toString()
  }, [appliedRange, page])

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const result = await customerApi<KhataData>(`/api/v1/users/me/financial-history?${query}`, { cache: "no-store" })
      setData(result as KhataData)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load your Khata")
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => { void load() }, [load])

  function applyPeriod() {
    const today = todayInIndia()
    if (period === "all") setAppliedRange({})
    else if (period === "day") setAppliedRange({ from: today, to: today })
    else if (period === "week") {
      const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay()
      const mondayOffset = weekday === 0 ? -6 : 1 - weekday
      setAppliedRange({ from: shiftDate(today, mondayOffset), to: today })
    } else if (period === "month") {
      setAppliedRange({ from: `${today.slice(0, 7)}-01`, to: today })
    } else {
      if (!from || !to || from > to) {
        setError("Select a valid date range.")
        return
      }
      setAppliedRange({ from, to })
    }
    setPage(1)
  }

  const summary = data?.ledger.summary
  const pages = data?.ledger.pagination.pages ?? 1

  return (
    <PortalShell title={t("customerKhata")} subtitle={t("statementPeriod")} links={[{ label: t("orders"), href: "/orders" }]}>
      <section className="khata-page">
        <div className="khata-summary panel">
          <h2>{t("financialSummary")}{data?.customer.name ? ` · ${data.customer.name}` : ""}</h2>
          <div className="khata-cards">
            <div><span>{t("totalOrderValue")}</span><strong>{money(data?.summary.totalOrderValue ?? 0, language)}</strong></div>
            <div><span>{t("totalPaid")}</span><strong>{money(data?.summary.totalPaid ?? 0, language)}</strong></div>
            <div><span>{t("outstandingBalance")}</span><strong>{money(data?.summary.outstanding ?? 0, language)}</strong></div>
          </div>
        </div>

        <section className="portal-panel khata-period">
          <label>{t("statementPeriod")}
            <select value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option value="all">{t("allTime")}</option>
              <option value="day">{t("day")}</option>
              <option value="week">{t("week")}</option>
              <option value="month">{t("month")}</option>
              <option value="custom">{t("customDateRange")}</option>
            </select>
          </label>
          {period === "custom" && <>
            <label>{t("from")}<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
            <label>{t("to")}<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
          </>}
          <button onClick={applyPeriod}>{t("applyFilter")}</button>
          <button className="khata-print" onClick={() => window.print()}>{t("downloadStatement")}</button>
        </section>

        {summary && <section className="khata-period-summary panel">
          <div><span>{t("openingBalance")}</span><strong>{money(summary.openingBalance, language)}</strong></div>
          <div><span>{t("totalCharges")}</span><strong>{money(summary.totalCharges, language)}</strong></div>
          <div><span>{t("totalPayments")}</span><strong>{money(summary.totalPayments, language)}</strong></div>
          <div><span>{t("adjustments")}</span><strong>{money(summary.adjustments, language)}</strong></div>
          <div><span>{t("closingBalance")}</span><strong>{money(summary.closingBalance, language)}</strong></div>
          <p>{t("openingBalanceNote")}</p>
        </section>}

        {error && <StateMessage error>{error}<br /><button onClick={() => void load()}>{t("tryAgain")}</button></StateMessage>}
        {loading ? <StateMessage>{t("loading")}</StateMessage> : !error && !data?.ledger.transactions.length
          ? <div className="portal-empty">{t("noRecords")}</div>
          : data && <section className="portal-panel"><div className="table-wrap"><table className="portal-table">
            <thead><tr>
              <th>{t("date")} / {t("time")}</th><th>{t("transactionId")}</th><th>{t("description")}</th><th>{t("orderNumber")}</th>
              <th>{t("debit")}</th><th>{t("credit")}</th><th>{t("closingBalance")}</th><th>{t("paymentMethod")}</th>
              <th>{t("collectedBy")}</th><th>{t("reference")}</th><th>{t("transactionStatus")}</th>
            </tr></thead>
            <tbody>{data.ledger.transactions.map((entry) => <tr key={entry.transactionId}>
              <td>{dateTime(entry.date, language)}</td><td>{entry.transactionId}</td><td>{entry.description}</td>
              <td><button className="customer-link" onClick={() => router.push(`/orders/${entry.orderId}`)}>{entry.orderNumber}</button></td>
              <td>{entry.debit ? money(entry.debit, language) : "—"}</td><td>{entry.credit ? money(entry.credit, language) : "—"}</td>
              <td>{money(entry.balance, language)}</td><td>{entry.method || "—"}</td><td>{entry.collector || "—"}</td>
              <td>{entry.referenceNumber || "—"}</td><td>{entry.status.replaceAll("_", " ")}</td>
            </tr>)}</tbody>
          </table></div>
          <div className="khata-pagination">
            <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t("previous")}</button>
            <span>{t("pageOf", { page: data.ledger.pagination.page, pages })}</span>
            <button disabled={page >= pages} onClick={() => setPage((value) => Math.min(pages, value + 1))}>{t("next")}</button>
          </div></section>}
      </section>
      <style jsx>{`
        .khata-page { display:grid; gap:16px; }
        .panel, .portal-panel { background:#fff; border:1px solid #e3e9e4; border-radius:14px; padding:18px; }
        .khata-summary h2 { margin:0 0 14px; font-size:20px; }
        .khata-cards, .khata-period-summary { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; }
        .khata-cards div, .khata-period-summary div { display:grid; gap:7px; }
        .khata-cards span, .khata-period-summary span { color:#64736a; font-size:12px; }
        .khata-cards strong, .khata-period-summary strong { font-size:18px; }
        .khata-period { display:flex; align-items:end; flex-wrap:wrap; gap:12px; }
        .khata-period label { min-width:145px; display:grid; gap:6px; }
        .khata-period input, .khata-period select { min-height:40px; padding:8px; border:1px solid #d9e1da; border-radius:8px; }
        .khata-period-summary p { grid-column:1/-1; margin:0; color:#64736a; font-size:12px; }
        .khata-pagination { display:flex; justify-content:flex-end; align-items:center; gap:12px; padding-top:14px; }
        .khata-pagination button { padding:8px 12px; border:1px solid #d9e1da; border-radius:8px; background:#fff; }
        .khata-pagination button:disabled { opacity:.5; }
        @media print { :global(.portal-header), :global(.portal-title), .khata-period, .khata-pagination { display:none !important; } .khata-page { gap:8px; } }
        @media (max-width:700px) { .table-wrap { overflow-x:auto; } .khata-period { align-items:stretch; } }
      `}</style>
    </PortalShell>
  )
}
