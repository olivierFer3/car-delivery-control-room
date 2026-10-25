"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import styles from "./driver.module.css"

type Order = { id: string; reference: string; vehicle: string; plate: string | null; route: string; driverName: string; ferry: { checkInCutoffAt: string; departureAt: string; from: string | null; to: string | null } | null; openIncidentId: string | null }
type Step = { id: string; at: string; label: string; origin: "real" | "simulated" | "dataset" | "driver" | "agent"; status: "done" | "error" | "running"; summary: string; findings?: { text: string; severity: string }[] }
type Msg = { id: string; role: "driver" | "agent" | "operator" | "system"; text: string; at: string; via: "text" | "voice" | "system"; callId?: string }
type Call = { id: string; mode: "live" | "test"; status: string; toMasked: string; failure?: string; extracted?: { applied: boolean; summary: string } }
type View = { id: string; reference: string; vehicle: string; driverName: string; report: string; state: string; phase: string; headline: string; detail: string; question: string | null; working: boolean; steps: Step[]; thread: Msg[]; calls: Call[]; phone: { mode: "live" | "test"; toMasked: string | null; canCall: boolean; calling: boolean }; serverTime: string }
type Status = { simulationTime: string; agent: { provider: string; model: string } | null; phone: { mode: "live" | "test"; toMasked: string | null; missing: string[] } }

const ORIGIN: Record<Step["origin"], string> = { real: "REAL data", simulated: "SIMULATED", dataset: "Synthetic data", driver: "You", agent: "Agent" }
const SIM_START = Date.parse("2026-10-21T09:00:00Z")
const store = { get(k: string) { try { return sessionStorage.getItem(k) } catch { return null } }, set(k: string, v: string) { try { sessionStorage.setItem(k, v) } catch { /* storage can be blocked */ } } }
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
function minutesUntil(iso: string) { const m = Math.round((Date.parse(iso) - SIM_START) / 60000); return m > 0 ? `${Math.floor(m / 60)} h ${m % 60} min` : "already closed" }

export default function DriverSupport() {
  const [code, setCode] = useState<string | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [orderId, setOrderId] = useState("")
  const [text, setText] = useState("")
  const [caseId, setCaseId] = useState<string | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [error, setError] = useState("")
  const [offline, setOffline] = useState(false)
  const [busy, setBusy] = useState("")
  const [authorize, setAuthorize] = useState(false)
  const [say, setSay] = useState("")
  const [form, setForm] = useState({ minutes: "", safe: "", blockers: "", text: "" })
  const threadEnd = useRef<HTMLDivElement>(null)

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(path, { ...init, cache: "no-store", headers: { "Content-Type": "application/json", "x-driver-code": code ?? "" } })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error ?? "Something went wrong")
    return data
  }, [code])

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("k") ?? store.get("driver-code")
    if (k) { store.set("driver-code", k); setCode(k) } else setCode("")
    const saved = new URLSearchParams(window.location.search).get("case") ?? store.get("driver-case")
    if (saved) setCaseId(saved)
  }, [])
  useEffect(() => {
    if (!code) return
    api("/api/driver/status").then(setStatus).catch(e => setError(e.message))
    api("/api/driver/orders").then(d => setOrders(d.orders)).catch(e => setError(e.message))
  }, [code, api])
  useEffect(() => {
    if (!code || !caseId) return
    let stop = false
    const tick = async () => {
      try { const v = await api(`/api/driver/incidents/${caseId}`); if (!stop) { setView(v); setOffline(false) } }
      catch (e) { if (!stop) { if (e instanceof Error && /not found/i.test(e.message)) { setCaseId(null); store.set("driver-case", "") } else setOffline(true) } }
    }
    void tick(); const timer = setInterval(tick, 2000)
    return () => { stop = true; clearInterval(timer) }
  }, [code, caseId, api])
  useEffect(() => { threadEnd.current?.scrollIntoView({ block: "nearest" }) }, [view?.thread.length])

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label); setError("")
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong") } finally { setBusy("") }
  }
  const submit = () => act("Reporting", async () => {
    const d = await api("/api/driver/incidents", { method: "POST", body: JSON.stringify({ orderId, text }) })
    store.set("driver-case", d.id); setCaseId(d.id); setView(null); setText("")
  })
  const call = () => act("Calling", () => api(`/api/driver/incidents/${caseId}/call`, { method: "POST", body: JSON.stringify({ authorizeLive: authorize }) }))
  const sendReply = () => act("Sending", async () => {
    await api(`/api/driver/incidents/${caseId}/reply`, { method: "POST", body: JSON.stringify({ minutes: Number(form.minutes), safe: form.safe === "yes" ? true : form.safe === "no" ? false : undefined, blockers: form.blockers.split("\n"), text: form.text }) })
    setForm({ minutes: "", safe: "", blockers: "", text: "" })
  })
  const testCall = (c: Call, action: "say" | "end") => act(action === "say" ? "Sending" : "Ending", async () => { await api(`/api/driver/incidents/${caseId}/call/${c.id}`, { method: "POST", body: JSON.stringify({ action, text: say }) }); if (action === "say") setSay("") })
  const newCase = () => { store.set("driver-case", ""); setCaseId(null); setView(null) }

  if (code === "") return <Shell><section className={styles.card}><h1>Driver Support</h1><p>Open the Driver Support link shown in the Control Room. It carries the access code for this demo.</p></section></Shell>
  const live = status?.phone.mode === "live"
  const activeCall = view?.calls.find(c => ["requested", "ringing", "in_progress", "processing"].includes(c.status))
  const selected = orders?.find(o => o.id === orderId)

  return <Shell status={status}>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!caseId && <>
      <section className={styles.card}>
        <h1>Report a problem</h1>
        <p className={styles.lead}>Pick the order you are driving, say what is wrong, and the support agent starts checking at once. Orders, drivers and ferries here are synthetic.</p>
        <fieldset className={styles.orders}><legend>Your order</legend>
          {!orders && !error && <p role="status">Loading orders…</p>}
          {orders?.map(o => <label key={o.id} className={styles.order} data-selected={orderId === o.id}>
            <input type="radio" name="order" value={o.id} checked={orderId === o.id} onChange={() => setOrderId(o.id)} />
            <span className={styles.orderMain}><b className={styles.ref}>{o.reference}</b><span>{o.vehicle}{o.plate ? ` · ${o.plate}` : ""}</span><span className={styles.muted}>{o.route}</span>
              <span className={styles.muted}>Driver: {o.driverName}{o.ferry ? ` · ferry check-in closes in ${minutesUntil(o.ferry.checkInCutoffAt)}` : ""}</span>
              {o.openIncidentId && <span className={styles.muted}>An earlier report exists for this order.</span>}</span>
          </label>)}
        </fieldset>
        <label className={styles.field}>What is wrong?
          <textarea value={text} maxLength={1000} rows={4} onChange={e => setText(e.target.value)} placeholder="Example: Breakdown on the motorway, waiting for a tow truck. I may miss my ferry." />
        </label>
        <button className={styles.primary} disabled={!orderId || text.trim().length < 5 || !!busy} onClick={submit}>{busy === "Reporting" ? "Reporting…" : "Report incident"}</button>
        {selected && <p className={styles.muted}>Simulated clock: 21 Oct 2026, 09:00 UTC. The agent will use REAL weather, road and train data for the cities on this route.</p>}
      </section>
    </>}
    {caseId && !view && !error && <section className={styles.card}><p role="status">Opening your case…</p></section>}
    {caseId && view && <>
      {offline && <p className={styles.warn} role="status">Reconnecting… your case is safe on the server.</p>}
      <section className={styles.card} data-phase={view.phase} aria-live="polite">
        <p className={styles.kicker}>{view.reference} · {view.vehicle} · case {view.id.slice(0, 8)}</p>
        <h1>{view.headline}</h1>
        <p className={styles.lead}>{view.detail}</p>
        {view.working && <p className={styles.live} role="status">Live: the agent is working on a step now.</p>}
        <details className={styles.report}><summary>Your report</summary><p>{view.report}</p></details>
      </section>

      {view.question && <section className={styles.card}>
        <p className={styles.kicker}>The agent asks</p>
        <p className={styles.question}>{view.question}</p>
        {activeCall ? <div className={styles.callbox}>
          <p><span className={styles.badge} data-kind={activeCall.mode}>{activeCall.mode === "live" ? "LIVE PHONE CALL" : "SIMULATED CALL"}</span> {activeCall.mode === "live" ? (activeCall.status === "ringing" ? `Your phone (${activeCall.toMasked}) is ringing. Answer it to talk to the voice agent.` : activeCall.status === "processing" ? "Call ended. Reading what you said…" : "You are on the call. Speak with the voice agent.") : "No phone network is used. Type what you would say."}</p>
          {activeCall.mode === "test" && activeCall.status === "in_progress" && <>
            <label className={styles.field}>You say<textarea rows={2} value={say} maxLength={600} onChange={e => setSay(e.target.value)} placeholder="It will take me about 5 hours. I am safe. The truck is waiting for a tow." /></label>
            <div className={styles.row}><button className={styles.secondary} disabled={!say.trim() || !!busy} onClick={() => testCall(activeCall, "say")}>Say it</button><button className={styles.primary} disabled={!!busy} onClick={() => testCall(activeCall, "end")}>End call and send</button></div>
          </>}
        </div> : <div className={styles.callbox}>
          <p><span className={styles.badge} data-kind={live ? "live" : "test"}>{live ? "LIVE PHONE" : "TEST MODE"}</span> {live ? `The agent can call your phone (${status?.phone.toMasked}) now. This is a real, chargeable call.` : "No phone number is configured, so calls are simulated here. Nothing leaves this server."}</p>
          {live && <label className={styles.check}><input type="checkbox" checked={authorize} onChange={e => setAuthorize(e.target.checked)} /> I authorize a real phone call to {status?.phone.toMasked}</label>}
          <button className={styles.primary} disabled={!view.phone.canCall || (live && !authorize) || !!busy} onClick={call}>{busy === "Calling" ? "Starting…" : live ? "Call me now" : "Start a simulated call"}</button>
        </div>}
        <details className={styles.text} open={!activeCall}><summary>Or answer by text</summary>
          <label className={styles.field}>Minutes until you reach the ferry terminal<input inputMode="numeric" value={form.minutes} onChange={e => setForm({ ...form, minutes: e.target.value.replace(/\D/g, "") })} placeholder="e.g. 300" /></label>
          <div className={styles.field} role="radiogroup" aria-label="Are you safe?">Are you and the vehicle safe?
            <div className={styles.row}><button type="button" className={form.safe === "yes" ? styles.primary : styles.secondary} aria-pressed={form.safe === "yes"} onClick={() => setForm({ ...form, safe: "yes" })}>Yes, safe</button><button type="button" className={form.safe === "no" ? styles.primary : styles.secondary} aria-pressed={form.safe === "no"} onClick={() => setForm({ ...form, safe: "no" })}>No</button></div></div>
          <label className={styles.field}>What blocks you? (one per line, optional)<textarea rows={2} value={form.blockers} onChange={e => setForm({ ...form, blockers: e.target.value })} /></label>
          <button className={styles.primary} disabled={!form.minutes || !form.safe || !!busy} onClick={sendReply}>{busy === "Sending" ? "Sending…" : "Send answer"}</button>
        </details>
      </section>}

      <section className={styles.card}>
        <h2>Conversation</h2>
        <ol className={styles.thread}>{view.thread.map(m => { const c = m.callId ? view.calls.find(x => x.id === m.callId) : undefined; return <li key={m.id} data-role={m.role}>
          <span className={styles.who}>{m.role === "driver" ? "You" : m.role === "agent" ? "Support agent" : m.role === "operator" ? "Operator" : "System"}
            {m.via === "voice" && <span className={styles.badge} data-kind={c?.mode ?? "test"}>{c?.mode === "live" ? "LIVE CALL" : "SIMULATED CALL"}</span>}
            <time>{clock(m.at)}</time></span><p>{m.text}</p></li> })}</ol>
        <div ref={threadEnd} />
      </section>

      <section className={styles.card}>
        <h2>What the agent did</h2>
        <p className={styles.muted}>Real model (Groq). Each result says where it came from.</p>
        <ol className={styles.steps}>{view.steps.length === 0 && <li className={styles.muted}>Starting…</li>}{view.steps.map(s => <li key={s.id} data-status={s.status}>
          <span className={styles.who}><b>{s.label}</b><span className={styles.badge} data-kind={s.origin}>{ORIGIN[s.origin]}</span><time>{clock(s.at)}</time></span>
          <p>{s.summary}</p>{s.findings?.map((f, k) => <p key={k} className={styles.finding} data-severity={f.severity}>{f.text}</p>)}</li>)}</ol>
      </section>
      <button className={styles.secondary} onClick={newCase}>Report another problem</button>
    </>}
  </Shell>
}

function Shell({ children, status }: { children: React.ReactNode; status?: Status | null }) {
  const live = status?.phone.mode === "live"
  return <div className={styles.page}>
    <header className={styles.top}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/bahn-logo.png" width={512} height={512} alt="Bahn Express" className={styles.logo} />
      <span className={styles.title}>Driver Support</span>
      {status && <span className={styles.badge} data-kind={live ? "live" : "test"}>{live ? "PHONE: LIVE" : "PHONE: TEST MODE"}</span>}
    </header>
    <p className={styles.notice}>Synthetic demo. Real AI agent and real weather, road and train data; simulated drivers, ferries and bookings. No booking is ever made.</p>
    <main className={styles.main}>{children}</main>
  </div>
}
