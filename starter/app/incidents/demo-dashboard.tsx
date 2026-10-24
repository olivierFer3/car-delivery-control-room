"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AppFrame } from "../components/app-frame"
import { SIMULATION_TIME, type PublicIncident } from "@/lib/incidents/contracts"
import { createDemoIncident } from "./actions"
import { OperatorAccess } from "./operator-access"
import styles from "./incidents.module.css"

const labels: Record<PublicIncident["state"], string> = { investigating: "Investigating", waiting: "Waiting", needs_decision: "Needs a decision", approved: "Approved · ready to apply", resolved: "Resolved incident", technical_error: "Needs technical review" }
export default function IncidentsPage() {
  const router = useRouter()
  const [incidents, setIncidents] = useState<PublicIncident[] | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError("")
    fetch("/api/incidents", { signal: controller.signal, cache: "no-store" }).then(async response => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? "Could not load incidents")
      setIncidents(body.incidents)
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load incidents") })
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
  const groups = [
    { title: "Your decisions", note: "Review the proposed change before anything is applied.", rows: incidents?.filter(i => ["needs_decision", "approved"].includes(i.state)) ?? [] },
    { title: "Investigating and waiting", note: "Cases still gathering information or waiting for the next step.", rows: incidents?.filter(i => ["investigating", "waiting", "technical_error"].includes(i.state)) ?? [] },
    { title: "Resolved incidents", note: "The incident is resolved. Delivery status is tracked separately.", rows: incidents?.filter(i => i.state === "resolved") ?? [] },
  ]
  return <AppFrame section="incidents" snapshotAt={SIMULATION_TIME}><main className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Control room · fictional simulation</p><h1>Incidents</h1><p>Investigate the signal. Review the decision. Keep the car moving.</p></div><button className={styles.primary} disabled={busy || !incidents} onClick={openDemo}>{busy ? "Opening incident…" : "Open ferry-delay demo"}</button></header>
    <p className={styles.back}><Link href="/incidents">← Incident dataset</Link></p>
    <OperatorAccess />
    <div className={styles.notice}><strong>Iteration 1 · mock investigation</strong><span>This demo reads the supplied order and simulates a proposal and booking change. No real messages or bookings are made.</span><Link href="/">Browse all orders →</Link></div>
    {error && <div className={styles.error} role="alert">{error}<button className={styles.secondary} onClick={() => setRefresh(n => n + 1)}>Try again</button></div>}
    {!incidents && !error && <p role="status" aria-busy="true" className={styles.panel}>Loading incidents…</p>}
    {incidents && groups.map(group => <section key={group.title} className={styles.section}><div className={styles.sectionHead}><h2>{group.title} <span className={styles.count}>{group.rows.length}</span></h2><p>{group.note}</p></div>
      {group.rows.length === 0 ? <p className={styles.empty}>No incidents in this queue.</p> : <ul className={styles.cards}>{group.rows.map(i => <li key={i.id}><Link className={styles.card} href={`/incidents/${i.id}`}><div className={styles.cardTop}><span className={styles.reference}>{i.orderId === "ord-00603" ? "CD-420603" : i.orderId}</span><span className={styles.badge}>{labels[i.state]}</span></div><h3>{i.summary}</h3><p>{i.nextStep}</p><span className={styles.open}>Open incident →</span></Link></li>)}</ul>}
    </section>)}
    <p className={styles.footnote}>Orders without an investigation remain <strong>Not checked</strong>. A quiet queue is not proof that every order is safe.</p>
  </main></AppFrame>
}
