"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AppFrame } from "../components/app-frame"
import { SIMULATION_TIME, type PublicIncident } from "@/lib/incidents/contracts"
import { createDemoIncident } from "./actions"
import { LiveAgentLauncher } from "./live-agent-controls"
import { OperatorAccess } from "./operator-access"
import { DriverLink } from "./driver-link"
import { StatusBadge, incidentStatus, paused, responsible } from "./status"
import type { OperationalOrder } from "@/lib/incidents/operational"
import styles from "./incidents.module.css"

export default function IncidentsPage() {
  const router = useRouter()
  const [incidents, setIncidents] = useState<PublicIncident[] | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [orders, setOrders] = useState<OperationalOrder[] | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    setError("")
    fetch("/api/incidents", { signal: controller.signal, cache: "no-store" }).then(async response => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? "Could not load incidents")
      setIncidents(body.incidents)
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load incidents") })
    // The order count is secondary: a failure here leaves the queues usable.
    fetch("/api/incidents/orders", { signal: controller.signal, cache: "no-store" }).then(r => r.ok ? r.json() : null).then(body => { if (body) setOrders(body.orders) }).catch(() => {})
    return () => controller.abort()
  }, [refresh])
  async function openDemo() {
    setBusy(true); setError("")
    try {
      const existing = incidents?.find(i => i.orderId === "ord-00603" && i.signalId === "alert-x5259ff7f2e03f0e6")
      if (existing) { router.push(`/incidents/${existing.id}`); return }
      const result = await createDemoIncident()
      if (!result.incident) throw new Error(result.error ?? "Could not open incident")
      router.push(`/incidents/${result.incident.id}`)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open incident") }
    finally { setBusy(false) }
  }
  // Live view: new driver reports and agent progress appear without a manual refresh.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return
      fetch("/api/incidents", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(b => { if (b?.incidents) setIncidents(b.incidents) }).catch(() => {})
    }, 3000)
    return () => clearInterval(timer)
  }, [])
  const human = (i: PublicIncident) => i.workflow === "human_review"
  const groups = [
    { id: "decisions", title: "Decisions needed", note: "A change is proposed. Nothing is booked or paid until you approve this exact version, then apply it.", urgent: true, rows: incidents?.filter(i => !human(i) && ["needs_decision", "approved"].includes(i.state)) ?? [] },
    { id: "waiting", title: "Waiting for information", note: "The case needs a fact first, usually a reply from the simulated driver (voice or text).", urgent: true, rows: incidents?.filter(i => !human(i) && i.state === "waiting") ?? [] },
    { id: "paused", title: "Paused · resume needed", note: "The agent stopped between checks. Open the incident and resume the investigation.", urgent: true, rows: incidents?.filter(i => !human(i) && paused(i)) ?? [] },
    { id: "investigating", title: "Investigating", note: "The agent is checking the facts right now.", rows: incidents?.filter(i => !human(i) && i.state === "investigating" && !paused(i)) ?? [] },
    { id: "technical", title: "Technical review", note: "A provider or storage problem stopped the run. Nothing was changed; check and resume.", urgent: true, rows: incidents?.filter(i => !human(i) && i.state === "technical_error") ?? [] },
    { id: "unsupported", title: "Unsupported · human handling", note: "Outside what the agent may handle. An operator takes these by hand.", rows: incidents?.filter(human) ?? [] },
    { id: "resolved", title: "Solved by the agent", note: "The agent found the solution and the incident is closed (any booking change was approved by a person first). Delivery status is tracked separately.", rows: incidents?.filter(i => !human(i) && i.state === "resolved") ?? [] },
  ]
  const unchecked = orders?.filter(o => o.checkStatus === "Not checked").length
  const renderGroup = (group: (typeof groups)[number]) => <section key={group.id} id={group.id} aria-labelledby={`${group.id}-title`} className={styles.section}><div className={styles.sectionHead}><h2 id={`${group.id}-title`}>{group.title} <span className={styles.count}>{group.rows.length}</span></h2><p>{group.note}</p></div>
      {group.rows.length === 0 ? <p className={styles.empty}>Nothing in this queue.</p> : <ul className={`${styles.cards} ${styles.rows}`}>{group.rows.map(i => <li key={i.id}><Link className={styles.card} href={`/incidents/${i.id}`}><div className={styles.cardTop}><span className={styles.reference}>{i.orderId === "ord-00603" ? "CD-420603" : i.orderId}</span><StatusBadge status={incidentStatus(i)} /></div><p className={styles.source}>{human(i) ? "Unsupported case · human handling" : i.driverReport ? `Driver report from ${i.driverReport.driverName} · real Groq agent · simulated services` : i.mode === "llm" ? "Real model investigation · simulated services" : "Preserved scripted demo"}</p><h3>{i.summary}</h3><p>{i.nextStep}</p><p className={styles.who}><strong>Next:</strong> {responsible(i)}</p><span className={styles.open}>Open incident →</span></Link></li>)}</ul>}
    </section>
  return <AppFrame section="incidents" snapshotAt={SIMULATION_TIME}><main className={styles.page}>
    <header className={styles.hero}><div><p className={styles.eyebrow}>Control room · fictional simulation</p><h1>Operations workspace</h1><p>What needs you now, what the agent is doing, and what is still unchecked. No real messages, bookings or payments are made.</p></div><div className={styles.heroTools}><OperatorAccess /><Link className={styles.secondary} href="/incidents/orders">All {orders?.length ?? 100} orders →</Link></div></header>
    {error && <div className={styles.error} role="alert">{error}<button className={styles.secondary} onClick={() => setRefresh(n => n + 1)}>Try again</button></div>}
    {!incidents && !error && <p role="status" aria-busy="true" className={styles.panel}>Loading incidents…</p>}
    <DriverLink />
    {incidents && <nav aria-label="Queues" className={styles.queueSummary}>
      {groups.map(g => <a key={g.id} href={`#${g.id}`} data-urgent={g.urgent && g.rows.length > 0}><strong>{g.rows.length}</strong><span>{g.title}</span></a>)}
      <Link href="/incidents/orders?check=Not+checked"><strong>{unchecked ?? "–"}</strong><span>Orders not checked</span></Link>
    </nav>}
    {incidents && <div className={styles.console}>
      <div className={styles.consoleMain}>{["decisions", "technical", "waiting", "paused"].map(id => groups.find(g => g.id === id)!).map(renderGroup)}</div>
      <aside className={styles.consoleSide} aria-label="Agent activity and other cases">{["investigating", "unsupported", "resolved"].map(id => groups.find(g => g.id === id)!).map(renderGroup)}</aside>
    </div>}
    <p className={styles.footnote}>Orders without an investigation stay <strong>Not checked</strong>. A quiet queue is not proof that every order is safe.</p>
    <details className={styles.raw}><summary>Earlier demos (kept for comparison)</summary>
      <div className={styles.notice}><strong>Scripted iteration-1 demo</strong><span>The original ferry-delay demo, with mock reasoning. No real messages or bookings are made.</span><button className={styles.primary} disabled={busy || !incidents} onClick={openDemo}>{busy ? "Opening incident…" : "Open ferry-delay demo"}</button></div>
      <LiveAgentLauncher />
      <p><Link href="/incidents">← Incident dataset view</Link></p>
    </details>
  </main></AppFrame>
}
