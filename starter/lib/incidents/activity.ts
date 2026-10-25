import type { Incident as FullIncident, DriverMessage } from "./contracts"
type Incident = Omit<FullIncident, "technical">

/** What the agent actually did, in words an operator or a driver can read, with where each fact came from. */
export type Origin = "real" | "simulated" | "dataset" | "driver" | "agent"
export type ActivityStep = {
  id: string; at: string; tool: string; label: string; origin: Origin; status: "done" | "error" | "running"
  summary: string; count?: number; findings?: { text: string; severity: "info" | "watch" | "risk"; source: string }[]
}
export const ORIGIN_LABEL: Record<Origin, string> = {
  real: "REAL data (live public source)", simulated: "SIMULATED service (fictional)", dataset: "Synthetic dataset",
  driver: "Driver (live person)", agent: "Agent reasoning",
}
const TOOLS: Record<string, { label: string; origin: Origin }> = {
  get_order_context: { label: "Read the order", origin: "dataset" },
  ask_driver: { label: "Ask the driver", origin: "driver" },
  check_external_conditions: { label: "Check weather, roads and trains", origin: "real" },
  track_flight: { label: "Track a flight", origin: "real" },
  check_booking_constraints: { label: "Check the booked ferry against the driver's ETA", origin: "simulated" },
  search_travel_options: { label: "Look for alternative sailings", origin: "simulated" },
  check_option_constraints: { label: "Check one alternative sailing", origin: "simulated" },
  create_proposal: { label: "Prepare a proposal for the operator", origin: "simulated" },
  find_similar_incidents: { label: "Look at similar past cases", origin: "dataset" },
  wait: { label: "Wait for missing information", origin: "agent" },
  close_disproved_alert: { label: "Close the alert", origin: "agent" },
  answer_operator: { label: "Answer the operator", origin: "agent" },
}
type Source = { label?: string; source?: string; status?: string; reason?: string; findings?: { text: string; severity: "info" | "watch" | "risk" }[] }
function liveFindings(result: unknown): ActivityStep["findings"] {
  const sources = (result as { sources?: Source[] } | null)?.sources ?? []
  return sources.map(s => s.status === "ok"
    ? { text: `${s.label ?? s.source}: ${(s.findings ?? []).map(f => f.text).join("; ") || "nothing notable"}`, severity: ((s.findings ?? []).some(f => f.severity === "risk") ? "risk" : (s.findings ?? []).some(f => f.severity === "watch") ? "watch" : "info") as "info" | "watch" | "risk", source: s.source ?? "" }
    : { text: `${s.label ?? s.source}: source unavailable (${s.reason ?? "no answer"}); nothing is concluded from it`, severity: "info" as const, source: s.source ?? "" })
}
function summarize(tool: string, args: Record<string, unknown>, result: unknown): { summary: string; findings?: ActivityStep["findings"] } {
  const r = (result ?? {}) as Record<string, unknown>
  if (typeof r.error === "string") return { summary: `Step rejected: ${r.error}` }
  switch (tool) {
    case "get_order_context": return { summary: "Read the order, its alerts, messages and the booked ferry (synthetic data)." }
    case "ask_driver": return { summary: `Asked the driver: "${String(args.question ?? r.question ?? "")}"` }
    case "check_external_conditions": case "track_flight": { const findings = liveFindings(result); return { summary: `${findings?.length ?? 0} live source(s) checked; each result is marked REAL.`, findings } }
    case "check_booking_constraints": return { summary: r.missesCutoff === true ? "The driver's ETA is after the ferry check-in cutoff: the booking is at risk." : r.canRetain === true ? "The driver can still make the booked ferry." : "Booking checked against the driver's report." }
    case "search_travel_options": return { summary: `${Array.isArray(result) ? result.length : 0} fictional alternative sailing(s) found. Quotes are not bookings.` }
    case "check_option_constraints": return { summary: r.feasible === true ? "This alternative is feasible with the driver's ETA (fictional quote)." : "This alternative does not work with the driver's ETA." }
    case "create_proposal": return { summary: `Proposal ready for the operator: ${String(r.summary ?? "")}` }
    case "wait": return { summary: "Waiting for missing information." }
    case "close_disproved_alert": return { summary: "Closed: no action needed. Delivery status is unchanged." }
    case "find_similar_incidents": return { summary: `${Array.isArray(r.cases) ? r.cases.length : 0} similar past case(s), as reference only.` }
    default: return { summary: "Done." }
  }
}
export function activitySteps(i: Incident): ActivityStep[] {
  const steps: ActivityStep[] = []
  for (const turn of i.modelTurns ?? []) {
    const t = turn.selected
    if (!t) {
      if (!turn.error) continue
      const busy = /429|rate.?limit/i.test(turn.error), last = steps.at(-1)
      if (last?.tool === "model" && last.summary.startsWith(busy ? "The AI model was busy" : "The model request failed")) { last.count = (last.count ?? 1) + 1; last.summary = busy ? `The AI model was busy (its per-minute limit), ${last.count} times in a row. The agent waited and retried.` : `The model request failed ${last.count} times (${turn.error}).`; continue }
      steps.push({ id: turn.id, at: turn.at, tool: "model", label: busy ? "AI model busy" : "Model request", origin: "agent", status: busy ? "done" : "error", count: 1, summary: busy ? "The AI model was busy (its per-minute limit). The agent waited and retried." : `The model request failed (${turn.error}); the agent retries or stops safely.` })
      continue
    }
    const meta = TOOLS[t.tool] ?? { label: t.tool, origin: "agent" as Origin }
    const done = turn.result !== undefined
    const { summary, findings } = done ? summarize(t.tool, t.args, turn.result) : { summary: "Running…", findings: undefined }
    steps.push({ id: turn.id, at: turn.at, tool: t.tool, label: meta.label, origin: meta.origin, status: !done ? "running" : typeof (turn.result as { error?: string })?.error === "string" ? "error" : "done", summary, findings })
  }
  return steps
}
/** The agent is between steps (choosing the next tool) rather than blocked on a person. */
export function agentBusy(i: Incident): boolean {
  return i.state === "investigating" && (!!i.activeRun || (i.modelTurns ?? []).at(-1)?.result === undefined)
}
export function pendingQuestion(i: Incident): string | null {
  const q = i.tasks.find(t => t.tool === "ask_driver")
  if (!q || i.driverReplies?.length || i.state !== "waiting") return null
  const text = (q.args as { question?: string }).question ?? (q.result as { question?: string })?.question
  return typeof text === "string" ? text : null
}
/** Idempotently adds the agent's, the operator's and the system's lines to the driver conversation. */
export function syncThread(i: Incident, now = new Date().toISOString()) {
  if (!i.driverReport) return
  const thread = (i.driverMessages ??= [])
  const add = (m: Omit<DriverMessage, "at"> & { at?: string }) => { if (!thread.some(x => x.id === m.id)) thread.push({ at: now, ...m } as DriverMessage) }
  const q = i.tasks.find(t => t.tool === "ask_driver")
  if (q) add({ id: "agent-question", role: "agent", via: "system", text: String((q.args as { question?: string }).question ?? (q.result as { question?: string })?.question ?? "") })
  i.proposals.forEach(p => add({ id: `agent-proposal-${p.version}`, role: "agent", via: "system", text: `I prepared a solution (version ${p.version}): ${p.summary} An operator must approve it before anything changes, and nothing is booked for real.` }))
  if (i.state === "resolved" && !i.proposals.length && i.driverReplies?.length) add({ id: "agent-closed", role: "agent", via: "system", text: `No change is needed. ${i.summary}` })
  i.decisions.forEach((d, k) => add({ id: `operator-decision-${k}`, role: "operator", via: "system", text: `${d.choice === "approve" ? "The operator approved the proposal" : d.choice === "reject" ? "The operator rejected the proposal" : "The operator asked for a different option"}${d.comment ? `: ${d.comment}` : "."}` }))
  i.executions.forEach(e => add({ id: `execution-${e.version}`, role: "system", via: "system", text: `${e.status === "succeeded" ? "Simulated booking change applied" : "Simulated change failed"}: ${e.reason}. No real booking was made.` }))
  for (const c of i.calls ?? []) c.transcript.forEach((l, idx) => add({ id: `call:${c.id}:${idx}`, role: l.role, via: "voice", callId: c.id, text: l.text }))
  if (i.state === "technical_error" && !i.agentRetry && !/429|rate.?limit|limit|timed out|timeout|HTTP 5\d\d|fetch failed/i.test(i.lastAgentError ?? "")) add({ id: `error-${(i.lastAgentError ?? "").slice(0, 40)}`, role: "system", via: "system", text: "The agent hit a technical problem and stopped without changing anything. An operator has been notified." })
}
