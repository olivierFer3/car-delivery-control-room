import { randomUUID } from "node:crypto"
import { SIMULATION_TIME, type CallSession, type DriverMessage, type Incident } from "@/lib/incidents/contracts"
import { createIncident, receiveDriverReply, WorkflowError } from "@/lib/incidents/engine"
import { activitySteps, agentBusy, pendingQuestion, syncThread } from "@/lib/incidents/activity"
import { orderSignals, sourceTimestamp } from "@/lib/incidents/operational"
import { configuredProviders } from "@/lib/incidents/providers"
import { commandIncidentService } from "@/lib/incidents/service"
import { getIncident, insertIncident, mutateIncident, toolsData } from "@/lib/incidents/store"
import { loadOrder } from "@/lib/present/load"
import { buildBoardCard } from "@/lib/present/board"
import { extractReply } from "@/lib/driver/extract"

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
/** Product mutations refuse while an agent step holds the lease; the driver's action simply waits for it. */
export async function mutateWithRetry(id: string, fn: (i: Incident) => Promise<void> | void, tries = 12) {
  for (let n = 0; ; n++) {
    try { return await mutateIncident(id, async i => { await fn(i) }) }
    catch (e) { if (e instanceof WorkflowError && /already running/.test(e.message) && n < tries) { await sleep(500); continue } throw e }
  }
}
const running = new Set<string>()
const TRANSIENT = /429|rate.?limit|limit|timed out|timeout|HTTP 5\d\d|fetch failed/i
/** Starts (or continues) the real investigation in the background; one run per incident at a time.
 *  A run that stops for a temporary reason (the model's per-minute token limit, a time limit) is retried automatically:
 *  finished tool results are kept, so a retry only does the remaining work. */
export function startAgent(id: string) {
  if (running.has(id)) return
  running.add(id)
  void (async () => {
    try {
      let nudged = 0
      for (let attempt = 1; attempt <= 6; attempt++) {
        await commandIncidentService(id, { command: "run" }).catch(() => {})
        const i = await getIncident(id)
        if (!i) return
        // The agent stopped to "wait" although the driver already answered and nothing is pending: its last step was rejected
        // (for example a proposal with incomplete source references). Let it continue with the recorded results, twice at most.
        if (i.state === "waiting" && !pendingQuestion(i) && i.driverReplies?.length && !i.proposals.length && !i.executions.length && nudged < 2) { nudged++; await sleep(5_000); continue }
        if (i.state !== "technical_error" || !TRANSIENT.test(i.lastAgentError ?? "") || attempt === 6) {
          await mutateWithRetry(id, inc => { delete inc.agentRetry; if (inc.state === "technical_error" && TRANSIENT.test(inc.lastAgentError ?? "")) inc.driverMessages = [...(inc.driverMessages ?? []), message("error-final", "system", "The AI service stayed busy and the agent stopped without changing anything. An operator can resume it.", "system")]; syncThread(inc) }).catch(() => {})
          return
        }
        await mutateWithRetry(id, inc => { inc.agentRetry = { attempt, reason: inc.lastAgentError ?? "temporary limit" } }).catch(() => {})
        await sleep(20_000)
      }
    } finally { running.delete(id) }
  })()
}
const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z")
const message = (id: string, role: DriverMessage["role"], text: string, via: DriverMessage["via"], callId?: string): DriverMessage => ({ id, role, text, via, at: new Date().toISOString(), ...(callId ? { callId } : {}) })

export async function createDriverIncident(input: { orderId: unknown; text: unknown }) {
  const text = typeof input.text === "string" ? input.text.trim() : ""
  if (text.length < 5 || text.length > 1000) throw new WorkflowError("Describe the problem in 5 to 1000 characters.")
  if (typeof input.orderId !== "string" || !input.orderId || input.orderId.length > 100) throw new WorkflowError("Choose an order.")
  const [c, loaded] = await Promise.all([toolsData.context(input.orderId), loadOrder(input.orderId)])
  if (!c || !loaded) throw new WorkflowError("Order not found")
  const signal = orderSignals(c).find(s => s.supported)
  if (!signal) throw new WorkflowError("This order has no supported booked ferry. Choose another order.")
  const provider = configuredProviders("groq", false).length ? "groq" : configuredProviders("gemini", false).length ? "gemini" : null
  if (!provider) throw new WorkflowError("No real agent model is configured on this server (Groq or Gemini key and allowed model).")
  const card = buildBoardCard(loaded.bundle)
  const i = createIncident(input.orderId, signal.id, "no_response")
  i.mode = "llm"; i.preferredProvider = provider; i.workflow = "ferry_delay"; i.demoRunId = i.id
  i.summary = `Driver report: ${text.length > 110 ? `${text.slice(0, 107)}...` : text}`
  i.nextStep = "The agent is investigating the driver's report"
  i.driverReport = { text, reportedAt: new Date().toISOString(), driverName: loaded.drivers[0]?.displayName ?? "Assigned driver", vehicle: card.vehicle, reference: loaded.order.reference as string, channel: "driver_app" }
  for (const row of [c.order, ...c.alerts.filter(r => r.id === signal.id), ...c.reservations.filter(r => r.id === signal.id)]) i.evidence.push({ id: row.id, source: `dataset:${row.id}`, at: sourceTimestamp(row), text: JSON.stringify(row), kind: "record" })
  i.evidence.push({ id: `driver-report:${i.id}`, source: "driver_app_report (synthetic driver, untrusted text)", at: SIMULATION_TIME, text: text, kind: "reported" })
  i.timeline.push({ type: "driver_report", at: SIMULATION_TIME, text: "A synthetic driver reported this incident on the Driver Support page. Real Groq investigation; driver is a live person, ferry and booking services are simulated." })
  i.driverMessages = [message("driver-report", "driver", text, "text")]
  syncThread(i)
  await insertIncident(i)
  startAgent(i.id)
  return i
}

export async function submitDriverReply(id: string, input: { minutes: unknown; safe: unknown; blockers: unknown; text: unknown }) {
  const minutes = Number(input.minutes)
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 2880) throw new WorkflowError("Enter whole minutes until you reach the ferry terminal (0 to 2880).")
  if (typeof input.safe !== "boolean") throw new WorkflowError("Say whether you are safe.")
  const blockers = Array.isArray(input.blockers) ? input.blockers.filter((b): b is string => typeof b === "string" && !!b.trim()).map(b => b.trim().slice(0, 200)).slice(0, 10) : []
  const text = typeof input.text === "string" && input.text.trim() ? input.text.trim().slice(0, 1000) : `About ${minutes} minutes to the terminal. ${input.safe ? "I am safe." : "I am not safe."}${blockers.length ? ` Blockers: ${blockers.join(", ")}.` : ""}`
  await mutateWithRetry(id, i => {
    if (!pendingQuestion(i)) throw new WorkflowError("The agent is not waiting for an answer right now.")
    receiveDriverReply(i, { command: "receive_driver_reply", terminalEta: iso(Date.parse(i.simulationTime) + minutes * 60_000), safe: input.safe as boolean, blockers, text })
    i.driverMessages = [...(i.driverMessages ?? []), message("driver-reply", "driver", text, "text")]
    syncThread(i)
  })
  startAgent(id)
}

/* ---------- Simulated call (no phone network, ever) ---------- */
const active = ["requested", "in_progress", "processing"]
export function callActive(i: Incident) { return (i.calls ?? []).some(c => active.includes(c.status)) }
export async function requestCall(id: string) {
  const session: CallSession = { id: randomUUID(), mode: "test", provider: "test-mode", status: "in_progress", requestedAt: new Date().toISOString(), startedAt: new Date().toISOString(), transcript: [] }
  await mutateWithRetry(id, i => {
    if (!i.driverReport) throw new WorkflowError("Not a driver incident")
    const q = pendingQuestion(i)
    if (!q) throw new WorkflowError("The agent has no question for you yet.")
    if (callActive(i)) throw new WorkflowError("A simulated call is already in progress for this incident.")
    session.transcript = [{ role: "agent", text: q }]
    i.calls = [...(i.calls ?? []), session]
    i.driverMessages = [...(i.driverMessages ?? []), message(`call-requested:${session.id}`, "system", "A SIMULATED call was started. No phone network is used; the driver types what they would say.", "system", session.id)]
    syncThread(i)
  })
  return session.id
}
/** Turns a finished call into evidence: read the transcript, hand the investigation agent the structured reply, resume it. */
export async function ingestCall(id: string, callId: string) {
  const i = await getIncident(id), call = i?.calls?.find(x => x.id === callId)
  if (!i || !call) return
  const extracted = await extractReply(call.transcript)
  let applied = false
  await mutateWithRetry(id, inc => {
    const c = inc.calls!.find(x => x.id === callId)!
    c.status = "completed"; c.endedAt ??= new Date().toISOString()
    const driverText = c.transcript.filter(l => l.role === "driver").map(l => l.text).join(" ").slice(0, 1000)
    if (pendingQuestion(inc) && extracted.minutesToTerminal !== null && extracted.safe !== null && driverText) {
      receiveDriverReply(inc, { command: "receive_driver_reply", terminalEta: iso(Date.parse(inc.simulationTime) + extracted.minutesToTerminal * 60_000), safe: extracted.safe, blockers: extracted.blockers, text: `${"Simulated call"}: ${driverText}` })
      applied = true
    }
    c.extracted = { ...extracted, applied }
    inc.driverMessages = [...(inc.driverMessages ?? []), message(`call-read:${callId}`, "system", applied ? `Read from the call by the AI: about ${extracted.minutesToTerminal} min to the terminal, ${extracted.safe ? "driver safe" : "driver NOT safe"}${extracted.blockers.length ? `, blockers: ${extracted.blockers.join(", ")}` : ", no blockers"}. The investigation continues.` : "The call did not give an ETA and a clear safety answer. Please send them below so the investigation can continue.", "system", callId)]
    syncThread(inc)
  })
  if (applied) startAgent(id)
}
/** Test mode only: the person types what they would say. Clearly a simulation, never the phone network. */
export async function testCallTurn(id: string, callId: string, text: unknown) {
  if (typeof text !== "string" || !text.trim() || text.length > 600) throw new WorkflowError("Type what you would say (up to 600 characters).")
  await mutateWithRetry(id, i => { const c = i.calls?.find(x => x.id === callId); if (!c || c.mode !== "test" || c.status !== "in_progress") throw new WorkflowError("No test call in progress."); c.transcript.push({ role: "driver", text: text.trim() }); syncThread(i) })
}
export async function endTestCall(id: string, callId: string) {
  await mutateWithRetry(id, i => { const c = i.calls?.find(x => x.id === callId); if (!c || c.mode !== "test" || c.status !== "in_progress") throw new WorkflowError("No test call in progress."); c.status = "processing"; syncThread(i) })
  await ingestCall(id, callId)
}

/* ---------- Driver-safe view ---------- */
export function driverView(i: Incident) {
  syncThread(i)
  const q = pendingQuestion(i)
  const calling = callActive(i)
  const phase = i.state === "technical_error" && !i.agentRetry ? "problem" : q ? "needs_driver" : i.state === "waiting" ? "agent_waiting" : i.state === "needs_decision" ? "with_operator" : i.state === "approved" ? "approved" : i.state === "resolved" ? "resolved" : "agent_working"
  const proposal = i.proposals.at(-1)
  const headline = {
    problem: "Support hit a technical problem", needs_driver: calling ? "On the call" : "The agent needs your answer", with_operator: "Waiting for an operator to approve the solution",
    approved: "Approved by the operator", agent_waiting: "The agent is waiting for information", resolved: i.executions.some(e => e.status === "succeeded") ? "Solved: simulated booking change applied" : "Resolved: no change needed", agent_working: "The agent is investigating",
  }[phase]
  const detail = {
    problem: "Nothing was changed. An operator has been notified and can resume the investigation. You can keep this page open.",
    needs_driver: calling ? "A call is open. Answer it, or send your answer by text below. This page updates by itself." : q, with_operator: proposal ? `${proposal.summary} Nothing is booked for real.` : "An operator is reviewing the proposal.",
    agent_waiting: `${i.nextStep} An operator can resume the investigation.`,
    approved: "The operator approved. The simulated change is applied as a separate step; this page updates by itself.",
    resolved: i.summary, agent_working: i.agentRetry ? "The AI service is busy (a per-minute limit). The agent retries by itself in a moment; nothing is lost." : "It is checking the order, live weather, roads and trains. This page updates by itself.",
  }[phase]
  return {
    id: i.id, reference: i.driverReport?.reference, vehicle: i.driverReport?.vehicle, driverName: i.driverReport?.driverName, report: i.driverReport?.text,
    state: i.state, phase, headline, detail, question: q, working: agentBusy(i),
    steps: activitySteps(i), thread: i.driverMessages ?? [],
    calls: (i.calls ?? []).map(c => ({ id: c.id, mode: c.mode, status: c.status, failure: c.failure, extracted: c.extracted, transcriptLines: c.transcript.length })),
    phone: { canCall: !!q && !calling, calling },
    serverTime: new Date().toISOString(),
  }
}
