import { ProviderFailure } from "./providers"
import { randomUUID } from "node:crypto"
import { SIMULATION_TIME, type Incident, type Scenario, type ToolCall, type Provider, type Proposal, type Command } from "./contracts"

export class WorkflowError extends Error {}
function requireThat(ok: unknown, message: string): asserts ok { if (!ok) throw new WorkflowError(message) }
export type RecordRow = Record<string, unknown> & { id: string }
export interface Context { order: RecordRow; alerts: RecordRow[]; messages: RecordRow[]; reservations: RecordRow[]; options: RecordRow[] }
export interface ToolsData { context(orderId: string): Promise<Context | null>; similar(query: string, exceptId: string): Promise<unknown[]> }
const stamp = (i: Incident) => i.simulationTime
function event(i: Incident, type: string, text: string) { i.timeline.push({ type, text, at: stamp(i) }) }
export function createIncident(orderId: string, signalId: string, scenario: Scenario): Incident {
  return { id: randomUUID(), orderId, signalId, scenario, simulationTime: SIMULATION_TIME, state: "investigating", summary: "Signal awaiting investigation", evidence: [], missing: [], contradictions: [], nextStep: "Read order context", tasks: [], proposals: [], decisions: [], executions: [], conversation: [], timeline: [{ type: "created", text: "Fictional investigation opened; delivery status unchanged", at: SIMULATION_TIME }], technical: [] }
}
function text(a: Record<string, unknown>, key: string) { const v = a[key]; requireThat(typeof v === "string" && v.length > 0 && v.length <= 4000, `Invalid ${key}`); return v }
function strings(a: Record<string, unknown>, key: string) { const v = a[key]; requireThat(Array.isArray(v) && v.length <= 30 && v.every(x => typeof x === "string" && x.length <= 4000), `Invalid ${key}`); return v as string[] }
function argsOnly(a: Record<string, unknown>, keys: string[]) { requireThat(a && !Array.isArray(a) && Object.keys(a).every(k => keys.includes(k)), "Unexpected tool argument") }
function current(i: Incident) { const p = i.proposals.at(-1); requireThat(p, "No proposal"); return p }
function editable(i: Incident) { requireThat(!i.executions.length && i.state !== "resolved" && i.state !== "approved", "Incident cannot be revised in this state") }
export function checkOption(i: Incident, c: Context, optionId: string) {
  const o = c.options.find(x => x.id === optionId)
  requireThat(o && o.kind === "FERRY", "Unknown ferry option for this order")
  const driver = i.tasks.find(t => t.tool === "ask_driver")?.result as { terminalEta?: string } | undefined
  const eta = driver?.terminalEta
  const cutoff = typeof o.check_in_cutoff_at === "string" ? o.check_in_cutoff_at : ""
  const times = [eta, cutoff, o.departure_at, o.arrival_at].map(x => typeof x === "string" ? Date.parse(x) : NaN)
  const feasible = times.every(Number.isFinite) && times[0] >= Date.parse(i.simulationTime) && times[0] <= times[1] && times[1] < times[2] && times[2] < times[3] && o.status === "AVAILABLE_QUOTE" && Number.isInteger(o.quote_cents) && Number(o.quote_cents) >= 0 && typeof o.currency === "string"
  return { optionId, feasible, terminalEta: eta ?? null, cutoff, limitation: "Timing check uses a simulated driver report. Quote is fictional, not a booking or live capacity guarantee." }
}
export async function useTool(i: Incident, call: ToolCall, data: ToolsData): Promise<unknown> {
  editable(i)
  requireThat(call && typeof call.tool === "string" && call.args && typeof call.args === "object", "Invalid tool call")
  const a = call.args
  let result: unknown
  // Every tool is scoped to the incident. The model never chooses a different order.
  switch (call.tool) {
    case "get_order_context": {
      argsOnly(a, [])
      const c = await data.context(i.orderId); requireThat(c, "Order not found")
      requireThat(c.alerts.some(x => x.id === i.signalId), "Initial signal not linked to this order")
      for (const row of [...c.alerts, ...c.messages, ...c.reservations, ...c.options]) {
        if (!i.evidence.some(x => x.id === row.id)) i.evidence.push({ id: row.id, source: `${row.data_origin === "SIMULATED_SERVICE" ? "simulated_service" : "dataset"}:${row.id}`, at: String(row.authored_at ?? row.triggered_at ?? row.checked_at ?? row.booked_at ?? SIMULATION_TIME), text: JSON.stringify(row), kind: row.author_type === "driver" ? "reported" : "record" })
      }
      result = c; break
    }
    case "ask_driver": {
      argsOnly(a, ["question"]); const question = text(a, "question")
      requireThat(i.tasks.some(t => t.tool === "get_order_context"), "Read context first")
      const prior = i.tasks.find(t => t.tool === "ask_driver")
      if (prior) return prior.result // A provider switch or retry does not send again.
      result = i.scenario === "no_response" ? { status: "no_response", question } : { status: "replied", question, terminalEta: i.scenario === "disproved" ? "2026-10-21T10:00:00Z" : "2026-10-21T13:00:00Z", text: i.scenario === "disproved" ? "Simulation: queue cleared; terminal ETA 10:00 UTC." : "Simulation: still in queue; terminal ETA 13:00 UTC.", simulated: true }
      i.evidence.push({ id: `driver:${i.id}`, source: "simulated_driver", at: stamp(i), text: JSON.stringify(result), kind: "reported" })
      if (i.scenario === "no_response") { i.state = "waiting"; i.missing = ["Current driver ETA"]; i.nextStep = "Await simulated driver response; operator can resume explicitly" }
      if (i.scenario === "contradiction") { i.contradictions = ["Simulated driver ETA 13:00 conflicts with simulated terminal desk ETA 10:00; neither is verified"]; i.evidence.push({ id: `desk:${i.id}`, source: "simulated_terminal_desk", at: stamp(i), text: "Simulation: desk reports ETA 10:00 UTC", kind: "reported" }) }
      break
    }
    case "search_travel_options": {
      argsOnly(a, []); const c = await data.context(i.orderId); requireThat(c, "Order not found"); result = c.options; break
    }
    case "check_option_constraints": {
      argsOnly(a, ["optionId"]); const c = await data.context(i.orderId); requireThat(c, "Order not found"); result = checkOption(i, c, text(a, "optionId")); break
    }
    case "find_similar_incidents": argsOnly(a, ["query"]); result = { warning: "Past resolution is a reference only, not current evidence or authorization", cases: await data.similar(text(a, "query"), i.id) }; break
    case "create_proposal": {
      argsOnly(a, ["optionId", "reservationId", "summary", "consequences", "evidenceIds"])
      requireThat(!i.contradictions.length, "Resolve contradictions before changing a booking")
      const c = await data.context(i.orderId); requireThat(c, "Order not found")
      const optionId = text(a, "optionId"), reservationId = text(a, "reservationId")
      const checked = i.tasks.some(t => t.tool === "check_option_constraints" && (t.result as { optionId: string; feasible: boolean }).optionId === optionId && (t.result as { feasible: boolean }).feasible)
      requireThat(checked && checkOption(i, c, optionId).feasible, "Feasible deterministic check required")
      const o = c.options.find(x => x.id === optionId)!, r = c.reservations.find(x => x.id === reservationId)
      requireThat(r && r.kind === "FERRY" && r.status === "BOOKED" && r.assignment_id === o.assignment_id, "Booked ferry and option must have same assignment")
      const evidenceIds = strings(a, "evidenceIds")
      requireThat(evidenceIds.includes(optionId) && evidenceIds.includes(reservationId) && evidenceIds.includes(`driver:${i.id}`) && evidenceIds.every(id => i.evidence.some(e => e.id === id)), "Current source references required")
      const p: Proposal = { version: i.proposals.length + 1, summary: text(a, "summary"), consequences: text(a, "consequences"), evidenceIds, actions: [{ kind: "change_booking", reservationId, optionId, costCents: Number(o.quote_cents), currency: String(o.currency), departureAt: String(o.departure_at), arrivalAt: String(o.arrival_at) }] }
      i.proposals.push(p); i.summary = p.summary; i.state = "needs_decision"; i.nextStep = "Human reviews this proposal version; approval permits simulated execution only"; result = p; break
    }
    case "wait": {
      argsOnly(a, ["reason", "missing", "contradictions"]); i.summary = text(a, "reason"); i.missing = strings(a, "missing"); i.contradictions = [...new Set([...i.contradictions, ...strings(a, "contradictions")])]; i.state = "waiting"; i.nextStep = i.summary; result = { waiting: true }; break
    }
    case "close_disproved_alert": {
      argsOnly(a, ["reason"])
      requireThat(i.scenario === "disproved" && i.tasks.some(t => t.tool === "ask_driver"), "Supporting investigation required")
      requireThat(!i.contradictions.length && !i.missing.length, "Unresolved evidence prevents closure")
      const c = await data.context(i.orderId)
      const reply = i.tasks.find(t => t.tool === "ask_driver")?.result as { terminalEta?: string } | undefined
      requireThat(c && reply?.terminalEta && c.reservations.some(r => r.kind === "FERRY" && r.status === "BOOKED" && typeof r.check_in_cutoff_at === "string" && Date.parse(reply.terminalEta!) <= Date.parse(r.check_in_cutoff_at) && Date.parse(reply.terminalEta!) >= Date.parse(i.simulationTime)), "Driver ETA must meet booked ferry cutoff")
      i.summary = text(a, "reason"); i.state = "resolved"; i.nextStep = "Alert investigation resolved in simulation; car delivery remains unchanged"; result = { resolved: true, delivered: false }; break
    }
    default: throw new WorkflowError("Tool not permitted")
  }
  i.tasks.push({ tool: call.tool, args: a, result, at: stamp(i) }); event(i, "tool", call.tool)
  return result
}
export function decide(i: Incident, command: Extract<Command, { command: "decide" }>) {
  requireThat(i.state === "needs_decision", "No decision pending")
  const p = current(i); requireThat(command.version === p.version, "Stale proposal version")
  requireThat(["approve", "reject", "alternative"].includes(command.choice), "Invalid decision")
  requireThat(typeof command.operator === "string" && command.operator.trim().length > 0 && command.operator.length <= 100, "Operator required")
  requireThat(typeof command.comment === "string" && command.comment.length <= 4000, "Invalid comment")
  i.decisions.push({ version: p.version, choice: command.choice, operator: command.operator, comment: command.comment, at: stamp(i) })
  i.state = command.choice === "approve" ? "approved" : command.choice === "alternative" ? "investigating" : "waiting"
  i.nextStep = command.choice === "approve" ? "Execute the approved version in simulation" : command.choice === "alternative" ? "Investigate an alternative; a new proposal needs new approval" : "Proposal rejected; await operator instructions"
  event(i, "decision", `${command.choice} version ${p.version}: ${command.comment}`)
}
export function executeApproved(i: Incident, version: number, fail = false) {
  const p = current(i); requireThat(version === p.version, "Stale proposal version")
  const prior = i.executions.find(e => e.version === version); if (prior) return prior
  requireThat(i.state === "approved" && i.decisions.at(-1)?.choice === "approve" && i.decisions.at(-1)?.version === version, "Human approval required for this version")
  const result = { version, status: fail ? "failed" as const : "succeeded" as const, at: stamp(i), effects: fail ? [] : structuredClone(p.actions), reason: fail ? "Simulated booking service failed; no booking change" : "Fictional booking changed in incident overlay; source snapshot and delivery status unchanged" }
  i.executions.push(result); i.state = fail ? "technical_error" : "resolved"; i.nextStep = fail ? "Operator reviews execution failure; approval remains recorded" : "Monitor delivery; incident resolution does not prove delivery"; event(i, "execution", result.reason); return result
}
export async function runAgent(i: Incident, data: ToolsData, providers: Provider[]) {
  requireThat(["investigating", "waiting", "technical_error"].includes(i.state) && !i.executions.length, "Agent cannot run in this state")
  const deadline = AbortSignal.timeout(90_000)
  i.state = "investigating"
  try {
    requireThat(providers.length > 0, "No configured provider")
    for (let iteration = 0; iteration < 10; iteration++) {
      let call: ToolCall | undefined
      for (const provider of providers.slice(0, 2)) {
        try { call = await provider.choose(structuredClone(i), AbortSignal.any([deadline, AbortSignal.timeout(25_000)])); i.technical.push({ provider: provider.name, model: provider.model }); break }
        catch (error) { i.technical.push({ provider: provider.name, model: provider.model, error: "Provider request failed; no business conclusion inferred" }); if (deadline.aborted) throw new Error("Execution time limit"); if (error instanceof ProviderFailure && !error.retryable) throw error }
      }
      requireThat(call, "All configured providers failed")
      deadline.throwIfAborted()
      await useTool(i, call, data)
      if (String(i.state) !== "investigating") return
    }
    throw new Error("Iteration limit reached")
  } catch (error) { i.state = "technical_error"; i.nextStep = "Technical failure; review and explicitly resume"; event(i, "technical_error", error instanceof WorkflowError ? error.message : "Agent execution failed or exceeded limits") }
}
