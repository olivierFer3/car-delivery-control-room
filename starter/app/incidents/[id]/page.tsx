"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { AppFrame } from "../../components/app-frame"
import { SIMULATION_TIME, type PublicIncident, type Command, type Evidence } from "@/lib/incidents/contracts"
import { fmtDateTime, fmtMoney } from "@/lib/present/time"
import { commandIncident } from "../actions"
import { LiveAgentControls } from "../live-agent-controls"
import { OperatorAccess } from "../operator-access"
import { StatusBadge, incidentStatus, paused, responsible } from "../status"
import styles from "../incidents.module.css"

const toolLabels: Record<string, string> = { get_order_context: "Read the order and linked records", ask_driver: "Asked the simulated driver for an ETA", search_travel_options: "Compared fictional ferry alternatives", check_option_constraints: "Checked ferry timing and constraints", check_booking_constraints: "Checked original booking against driver ETA, safety and blockers", receive_driver_reply: "Received a new simulated driver reply", create_proposal: "Prepared a proposal for review", wait: "Paused for missing information", close_disproved_alert: "Closed the disproved alert" }
function evidenceText(e: Evidence) {
  try {
    const row = JSON.parse(e.text)
    if (row.text) return String(row.text)
    if (row.kind === "FERRY") return `${row.status === "BOOKED" ? "Recorded ferry booking" : "Ferry alternative"}${row.provider ? ` · ${row.provider}` : ""}${row.departure_at ? ` · departs ${fmtDateTime(row.departure_at)}` : ""}${typeof row.quote_cents === "number" ? ` · ${fmtMoney(row.quote_cents, row.currency)}` : ""}`
    return String(row.body ?? row.summary ?? row.message ?? row.title ?? row.description ?? "Linked source record; expand to inspect its fields.")
  } catch { return e.text }
}
function sourceRecord(e: Evidence): Record<string, unknown> | null {
  try { const value: unknown = JSON.parse(e.text); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null } catch { return null }
}
export default function IncidentPage() {
  const { id } = useParams<{ id: string }>()
  const [incident, setIncident] = useState<PublicIncident | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("")
  const [comment, setComment] = useState("")
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError("")
    fetch(`/api/incidents/${encodeURIComponent(id)}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error ?? "Could not load incident")
      setIncident(body)
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load incident") })
    return () => controller.abort()
  }, [id, refresh])
  useEffect(()=>{
    if (incident?.mode !== "llm" || (!busy && !incident.activeRun)) return
    const timer=setInterval(()=>setRefresh(n=>n+1),2500)
    return ()=>clearInterval(timer)
  },[busy,incident?.mode,incident?.activeRun])
  async function act(command: Command, label: string) {
    setBusy(label); setError("")
    try {
      const result = await commandIncident(id, command)
      if (!result.incident) throw new Error(result.error ?? "Could not save this action. Refresh to check the latest state before retrying.")
      setIncident(result.incident); setComment("")
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save action") }
    finally { setBusy("") }
  }
  const proposal = incident?.proposals.at(-1)
  const records = incident?.evidence.map(e => ({ evidence: e, row: sourceRecord(e) })) ?? []
  const signalSource = records.find(item => item.evidence.id === incident?.signalId)
  const bookedFerry = records.find(item => item.row?.kind === "FERRY" && item.row?.status === "BOOKED" && (!proposal || proposal.actions.some(action => action.reservationId === item.evidence.id)))
  const cutoff = typeof bookedFerry?.row?.check_in_cutoff_at === "string" ? bookedFerry.row.check_in_cutoff_at : null
  const driverResult = incident?.driverReplies?.at(-1) ?? incident?.tasks.find(task => task.tool === "ask_driver")?.result as { terminalEta?: unknown } | undefined
  const driverEta = typeof driverResult?.terminalEta === "string" ? driverResult.terminalEta : null
  const missesCutoff = cutoff && driverEta && Number.isFinite(Date.parse(cutoff)) && Number.isFinite(Date.parse(driverEta)) ? Date.parse(driverEta) > Date.parse(cutoff) : null
  const latestDecision = incident?.decisions.at(-1)
  const canPrepare = incident && incident.mode !== "llm" && ["investigating", "waiting", "technical_error"].includes(incident.state) && !incident.executions.length
  function decide(choice: "approve" | "reject" | "alternative") {
    if (!proposal) return
    void act({ command: "decide", version: proposal.version, choice, operator: "demo-operator", comment }, choice === "approve" ? "Saving approval…" : choice === "reject" ? "Saving rejection…" : "Requesting alternative…")
  }
  return <AppFrame section="incidents" snapshotAt={incident?.simulationTime ?? SIMULATION_TIME}><main className={styles.page}>
    <Link className={styles.back} href="/incidents?view=workspace">← All incidents</Link>
    <OperatorAccess />
    {error && <div className={styles.error} role="alert">{error}<button disabled={!!busy} className={styles.secondary} onClick={() => setRefresh(n => n + 1)}>Refresh and check the latest state</button></div>}
    {!incident && !error && <p className={styles.panel} role="status" aria-busy="true">Loading incident…</p>}
    {incident && <>
      <header className={styles.hero}><div><p className={styles.eyebrow}>{incident.workflow==="human_review"?"Human handoff":"Ferry risk"} · {incident.workflow==="human_review"?"no automated investigation":incident.mode === "llm" ? "real model investigation" : "scripted demo investigation"}</p><h1>{incident.orderId === "ord-00603" ? "CD-420603" : incident.orderId}</h1><p>{incident.summary}</p></div><StatusBadge status={incidentStatus(incident)} /></header>
      <div className={styles.notice}><strong>Fictional actions only</strong><span>Incident decisions do not change the recorded delivery status.</span><Link href={`/orders/${incident.orderId}`}>Open original order →</Link></div>
      <section className={`${styles.panel} ${styles.situation}`} aria-label="What happened"><h2>What happened</h2><p>{incident.workflow==="human_review"?"This source is outside the automated workflow and needs a human investigation.":"The selected alert or booked ferry is a reason to investigate the connection. It does not establish a missed ferry."}</p>
        {signalSource?.row && typeof signalSource.row.summary === "string" && <p className={styles.consequences}>{signalSource.row.summary}</p>}
        <dl className={styles.situationFacts}><div><dt>Booked ferry check-in cutoff</dt><dd>{cutoff ? <a href={`#evidence-${bookedFerry!.evidence.id}`}>{fmtDateTime(cutoff)}</a> : "Not checked yet"}</dd></div><div><dt>Simulated driver terminal ETA</dt><dd>{driverEta ? <a href={`#evidence-${incident.driverReplies?.at(-1)?.id ?? `driver:${incident.id}`}`}>{fmtDateTime(driverEta)} · driver report</a> : incident.tasks.some(task => task.tool === "ask_driver") ? "No ETA received" : "Not checked yet"}</dd></div></dl>
        {missesCutoff !== null && <p className={styles.footnote}>{missesCutoff ? "The simulated driver ETA is after the booked cutoff. A later ferry alternative needs review before any booking change." : "The simulated driver ETA meets the booked cutoff. This report alone does not prove check-in or boarding."}</p>}
      </section>
      <div aria-live="polite" className={styles.next}><p className={styles.eyebrow}>What happens next</p><p>{paused(incident) ? `The agent stopped after its last check (${incident.nextStep.toLowerCase()}). Resume the investigation below to let it continue.` : incident.nextStep}</p><p className={styles.who}><strong>Who acts:</strong> {responsible(incident)}</p>{busy && <p role="status">{busy}</p>}
        {canPrepare && <button disabled={!!busy} className={styles.primary} onClick={() => act({ command: "mock_proposal" }, "Preparing mock proposal…")}>{proposal ? "Prepare another mock proposal" : "Prepare mock proposal"}</button>}
      </div>
      {incident.mode === "llm" && <LiveAgentControls incident={incident} busy={!!busy} act={act} />}
      <div className={styles.columns}><div className={styles.stack}>
        <section className={styles.panel}><div className={styles.sectionHead}><h2>Proposed decision {proposal && <span className={styles.count}>Version {proposal.version}</span>}</h2></div>
          {!proposal ? <p className={styles.empty}>No proposal yet. Investigate the incident to check whether a change is needed.</p> : <><h3>{proposal.summary}</h3><p className={styles.consequences}>{proposal.consequences}</p>
          {proposal.actions.map((action, index) => <div className={styles.action} key={index}><h3>What would change: the fictional ferry booking</h3><dl className={styles.facts}><div><dt>Booked departure now</dt><dd>{typeof bookedFerry?.row?.departure_at === "string" ? fmtDateTime(bookedFerry.row.departure_at) : "Not in the checked sources"}</dd></div><div><dt>Proposed departure</dt><dd>{fmtDateTime(action.departureAt)}</dd></div><div><dt>Proposed arrival</dt><dd>{fmtDateTime(action.arrivalAt)}</dd></div><div><dt>Quoted cost of the new booking</dt><dd>{fmtMoney(action.costCents, action.currency)}</dd></div></dl><details><summary className={styles.source}>Booking references</summary><dl className={styles.facts}><div><dt>Reservation</dt><dd className={styles.identifier}>{action.reservationId}</dd></div><div><dt>Proposed option</dt><dd className={styles.identifier}>{action.optionId}</dd></div></dl></details><p className={styles.footnote}>Quote only; fictional availability. Approval applies to these actions in version {proposal.version}.</p></div>)}
          {incident.state === "needs_decision" && <div className={styles.review}><label htmlFor="decision-comment">Decision note <span>(optional)</span></label><textarea id="decision-comment" value={comment} maxLength={4000} disabled={!!busy} onChange={event => setComment(event.target.value)} placeholder="Add context for the decision" /><div className={styles.buttons}><button className={styles.primary} disabled={!!busy} onClick={() => decide("approve")}>Approve version {proposal.version}</button><button className={styles.secondary} disabled={!!busy} onClick={() => decide("reject")}>Reject proposal</button><button className={styles.secondary} disabled={!!busy} onClick={() => decide("alternative")}>Request alternative</button></div><p className={styles.footnote}>Approval is saved first. You then explicitly apply the simulated change.</p></div>}
          {incident.state === "approved" && <div className={styles.review}><p>Version {proposal.version} is approved. No change has been applied yet.</p><button className={styles.primary} disabled={!!busy} onClick={() => act({ command: "execute", version: proposal.version }, "Applying simulated change…")}>Apply approved simulated change</button></div>}
          {latestDecision && <p className={styles.decision}>Latest decision: <strong>{latestDecision.choice === "approve" ? "Approved" : latestDecision.choice === "reject" ? "Rejected" : "Alternative requested"}</strong> · version {latestDecision.version} · {latestDecision.operator}{latestDecision.comment ? ` — ${latestDecision.comment}` : ""}</p>}
          </>}
        </section>
        <section className={styles.panel} aria-live="polite"><h2>Simulated action result</h2>{incident.executions.length === 0 ? <p className={styles.empty}>No action has been executed. A proposal or approval alone does not change a booking.</p> : incident.executions.map(execution => <div className={execution.status === "succeeded" ? styles.success : styles.error} key={execution.version}><h3>{execution.status === "succeeded" ? "Simulated booking change completed" : "Simulated change failed"}</h3><p>Version {execution.version} · {fmtDateTime(execution.at)}</p><p>{execution.reason}</p><p>{execution.effects.length} simulated change{execution.effects.length === 1 ? "" : "s"} recorded. The source order and delivery status remain unchanged.</p></div>)}</section>
        <section className={styles.panel}><h2>Sources and evidence <span className={styles.count}>{incident.evidence.length}</span></h2>{!incident.evidence.length && <p className={styles.empty}>The agent has not checked the linked sources yet.</p>}<ul className={styles.evidence}>{incident.evidence.map(e => <li key={e.id} id={`evidence-${e.id}`}><p className={styles.source}>{e.kind === "reported" ? "Attributed report" : e.kind === "assumption" ? "Assumption" : "Source record"} · {fmtDateTime(e.at)}{proposal?.evidenceIds.includes(e.id) ? " · Cited in proposal" : ""}</p><p>{evidenceText(e)}</p><details><summary className={styles.source}>Show source record · {e.source}</summary><pre>{(() => { try { return JSON.stringify(JSON.parse(e.text), null, 2) } catch { return e.text } })()}</pre></details></li>)}</ul></section>
      </div><aside className={styles.stack}>
        <section className={styles.panel}><h2>What the agent checked</h2>{!incident.tasks.length ? <p className={styles.empty}>No investigation tasks completed yet.</p> : <ol className={styles.tasks}>{incident.tasks.map((task, index) => <li key={index}><strong>{toolLabels[task.tool] ?? task.tool}</strong><span>{fmtDateTime(task.at)}</span></li>)}</ol>}</section>
        <section className={styles.panel}><h2>Missing and conflicting information</h2>{!incident.missing.length && !incident.contradictions.length ? <p className={styles.empty}>No additional gaps recorded. Simulated reports and quotes remain unverified outside this demo.</p> : <><ul className={styles.bullets}>{incident.missing.map((text, index) => <li key={index}>{text}</li>)}</ul><ul className={styles.bullets}>{incident.contradictions.map((text, index) => <li key={index}>Conflicting sources: {text}</li>)}</ul></>}</section>
        <section className={styles.panel}><h2>Incident timeline</h2><ol className={styles.timeline}>{incident.timeline.map((item, index) => <li key={index}><span>{fmtDateTime(item.at)}</span><p>{item.type === "tool" ? toolLabels[item.text] ?? item.text : item.text}</p></li>)}</ol></section>
      </aside></div>
    </>}
  </main></AppFrame>
}
