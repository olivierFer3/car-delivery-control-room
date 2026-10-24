import { bookingConstraints, latestDriver } from "./booking-check"
import { ProviderFailure } from "./providers"
import { proposalArgsSchema } from "./proposal-contract"
import { randomUUID } from "node:crypto"
import { SIMULATION_TIME, type Incident, type Scenario, type ToolCall, type Provider, type Proposal, type Command, type DriverReply, type ModelTurn } from "./contracts"

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
/** A recorded unanswered question is an external-event boundary, not a reason
 * to spend more model calls. Keep any independent checks already completed.
 */
function waitForPendingDriver(i: Incident): boolean {
  if (latestDriver(i) || !i.tasks.some(t => t.tool === "ask_driver" && (t.result as {status?: string})?.status === "no_response")) return false
  const wasWaiting = i.state === "waiting"
  i.state = "waiting"
  i.missing = [...new Set([...i.missing, i.mode === "llm" ? "Current driver reply" : "Current driver ETA"])]
  i.nextStep = "Await simulated driver response; operator can resume explicitly"
  i.stopReason = i.nextStep
  i.lastAgentError = undefined
  if (!wasWaiting) event(i, "driver_wait", "Driver has not replied; investigation suspended without repeating outreach")
  return true
}
export function checkOption(i: Incident, c: Context, optionId: string) {
  const o = c.options.find(x => x.id === optionId)
  requireThat(o && o.kind === "FERRY", "Unknown ferry option for this order")
  const driver = latestDriver(i)
  const eta = driver?.terminalEta
  const cutoff = typeof o.check_in_cutoff_at === "string" ? o.check_in_cutoff_at : ""
  const times = [eta, cutoff, o.departure_at, o.arrival_at].map(x => typeof x === "string" ? Date.parse(x) : NaN)
  const feasible = times.every(Number.isFinite) && times[0] >= Date.parse(i.simulationTime) && times[0] <= times[1] && times[1] < times[2] && times[2] < times[3] && o.status === "AVAILABLE_QUOTE" && Number.isInteger(o.quote_cents) && Number(o.quote_cents) >= 0 && typeof o.currency === "string"
  return { optionId, feasible, driverEvidenceId: driver?.id ?? null, terminalEta: eta ?? null, cutoff, limitation: "Timing check uses a simulated driver report. Quote is fictional, not a booking or live capacity guarantee." }
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
      const reply = latestDriver(i)
      if (reply) return {status:"replied", ...reply, simulated:true}
      const prior = i.tasks.find(t => t.tool === "ask_driver")
      if (prior) { waitForPendingDriver(i); return prior.result } // Never send again, including after restart.
      result = i.scenario === "no_response" ? { status: "no_response", question } : { status: "replied", question, terminalEta: i.scenario === "disproved" ? "2026-10-21T10:00:00Z" : "2026-10-21T13:00:00Z", text: i.scenario === "disproved" ? "Simulation: queue cleared; terminal ETA 10:00 UTC." : "Simulation: still in queue; terminal ETA 13:00 UTC.", simulated: true }
      if (i.scenario !== "no_response") {
        const r = result as {terminalEta:string; text:string}
        i.driverReplies = [...(i.driverReplies ?? []), {id:`driver:${i.id}`,terminalEta:r.terminalEta,safe:true,blockers:[],text:r.text,at:stamp(i)}]
        result = {...r,status:"replied",...i.driverReplies.at(-1),simulated:true}
      }
      i.evidence.push({ id: `driver:${i.id}`, source: "simulated_driver", at: stamp(i), text: JSON.stringify(result), kind: "reported" })
      if (i.scenario === "contradiction") { i.contradictions = ["Simulated driver ETA 13:00 conflicts with simulated terminal desk ETA 10:00; neither is verified"]; i.evidence.push({ id: `desk:${i.id}`, source: "simulated_terminal_desk", at: stamp(i), text: "Simulation: desk reports ETA 10:00 UTC", kind: "reported" }) }
      break
    }
    case "check_booking_constraints": {
      argsOnly(a,["reservationId"])
      const c=await data.context(i.orderId); requireThat(c,"Order not found")
      const reservationId=text(a,"reservationId")
      requireThat(c.reservations.some(r=>r.id===reservationId && r.kind==="FERRY" && r.status==="BOOKED"),"Current booked ferry required")
      result=bookingConstraints(i,c,reservationId); break
    }
    case "search_travel_options": {
      argsOnly(a, []); const c = await data.context(i.orderId); requireThat(c, "Order not found"); result = c.options; break
    }
    case "check_option_constraints": {
      argsOnly(a, ["optionId"]); const c = await data.context(i.orderId); requireThat(c, "Order not found"); result = checkOption(i, c, text(a, "optionId")); break
    }
    case "find_similar_incidents": argsOnly(a, ["query"]); result = { warning: "Past resolution is a reference only, not current evidence or authorization", cases: await data.similar(text(a, "query"), i.id) }; break
    case "create_proposal": {
      argsOnly(a, Object.keys(proposalArgsSchema.properties))
      requireThat(!i.contradictions.length, "Resolve contradictions before changing a booking")
      const c = await data.context(i.orderId); requireThat(c, "Order not found")
      const optionId = text(a, "optionId"), reservationId = text(a, "reservationId")
      const checked = i.tasks.some(t => t.tool === "check_option_constraints" && (t.result as { optionId: string; feasible: boolean }).optionId === optionId && (t.result as { feasible: boolean }).feasible)
      requireThat(checked && checkOption(i, c, optionId).feasible, "Feasible deterministic check required")
      const o = c.options.find(x => x.id === optionId)!, r = c.reservations.find(x => x.id === reservationId)
      requireThat(r && r.kind === "FERRY" && r.status === "BOOKED" && r.assignment_id === o.assignment_id, "Booked ferry and option must have same assignment")
      const evidenceIds = strings(a,"evidenceIds"), driver=latestDriver(i)
      if (i.mode === "llm") {
        requireThat(i.tasks.some(t=>t.tool==="check_booking_constraints" && (t.result as {reservationId:string}).reservationId===reservationId && (t.result as {driverEvidenceId?:string}).driverEvidenceId===driver?.id) && bookingConstraints(i,c,reservationId).missesCutoff===true,"Check the original booking first; a change requires an established cutoff risk")
        const previous=i.proposals.at(-1), decision=i.decisions.at(-1)
        requireThat(!previous || !decision || decision.choice==="approve" || !previous.actions.some(action=>action.optionId===optionId),"Select a different option after rejection or alternative request")
      }
      requireThat(evidenceIds.includes(optionId) && evidenceIds.includes(reservationId) && driver && evidenceIds.includes(driver.id) && evidenceIds.every(id => i.evidence.some(e => e.id === id)), "Current source references required")
      const p: Proposal = { version: i.proposals.length + 1, summary: text(a, "summary"), consequences: text(a, "consequences"), evidenceIds, actions: [{ kind: "change_booking", reservationId, optionId, costCents: Number(o.quote_cents), currency: String(o.currency), departureAt: String(o.departure_at), arrivalAt: String(o.arrival_at) }] }
      i.proposals.push(p); i.summary = p.summary; i.state = "needs_decision"; i.nextStep = "Human reviews this proposal version; approval permits simulated execution only"; result = p; break
    }
    case "wait": {
      argsOnly(a,["reason","missing","contradictions"])
      const reason=text(a,"reason"), missing=strings(a,"missing"), contradictions=[...new Set([...i.contradictions,...strings(a,"contradictions")])]
      requireThat(missing.length>0 || contradictions.length>0,"Waiting requires concrete missing information or a contradiction")
      requireThat(!/approv/i.test([reason,...missing].join(" ")),"Approval is requested by create_proposal, not wait. The operator asked for a new version; the old version is not pending approval.")
      i.summary=reason; i.missing=missing; i.contradictions=contradictions; i.state="waiting"; i.nextStep=reason; result={waiting:true}; break
    }
    case "close_disproved_alert": {
      argsOnly(a, ["reason"])
      requireThat(!i.contradictions.length && !i.missing.length,"Unresolved evidence prevents closure")
      const c=await data.context(i.orderId); requireThat(c,"Order not found")
      const checked=i.tasks.some(t=>t.tool==="check_booking_constraints" && (t.result as {canRetain?:boolean;driverEvidenceId?:string}).canRetain === true && (t.result as {driverEvidenceId?:string}).driverEvidenceId === latestDriver(i)?.id && bookingConstraints(i,c,String(t.args.reservationId)).canRetain)
      const legacy=i.mode!=="llm" && i.scenario==="disproved" && c.reservations.some(r=>bookingConstraints(i,c,r.id).canRetain)
      requireThat(checked || legacy,"A current booking check, safe driver and no blockers are required to retain the booking")
      i.summary = text(a, "reason"); i.state = "resolved"; i.nextStep = "Alert investigation resolved in simulation; car delivery remains unchanged"; result = { resolved: true, delivered: false }; break
    }
    default: throw new WorkflowError("Tool not permitted")
  }
  i.tasks.push({ tool: call.tool, args: a, result, at: stamp(i) }); event(i, "tool", call.tool)
  if (call.tool === "ask_driver") waitForPendingDriver(i)
  return result
}
export function decide(i: Incident, command: Extract<Command, { command: "decide" }>) {
  const revisedAlternative=command.choice === "alternative" && ["waiting","investigating","technical_error"].includes(i.state) && i.proposals.length > 0 && !i.executions.length && i.decisions.at(-1)?.choice !== "approve"
  requireThat(i.state === "needs_decision" || revisedAlternative,"No decision pending")
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
export function receiveDriverReply(i: Incident, input: Extract<Command,{command:"receive_driver_reply"}>) {
  requireThat(i.mode === "llm" && i.tasks.some(t => t.tool === "ask_driver"), "No pending simulated driver question")
  requireThat(typeof input.terminalEta === "string" && /Z$/.test(input.terminalEta) && Number.isFinite(Date.parse(input.terminalEta)) && Date.parse(input.terminalEta) >= Date.parse(i.simulationTime), "A valid simulation-time ETA in UTC is required")
  requireThat(typeof input.safe === "boolean" && Array.isArray(input.blockers) && input.blockers.length <= 20 && input.blockers.every(b => typeof b === "string" && b.length <= 500) && typeof input.text === "string" && input.text.length > 0 && input.text.length <= 4000, "Invalid simulated reply")
  const prior = i.driverReplies?.at(-1)
  if (prior) {
    // One explicit reply per pending question has a stable incident-local ID.
    // Exact delivery retries are no-ops even after resume/approval/execution;
    // conflicting data must never overwrite an already processed report.
    requireThat(prior.id === `driver:${i.id}:reply` && prior.terminalEta === input.terminalEta && prior.safe === input.safe && prior.text === input.text && JSON.stringify(prior.blockers) === JSON.stringify(input.blockers), "Driver reply already received; conflicting reply rejected")
    return
  }
  requireThat(i.state === "waiting" && !i.proposals.length && !i.executions.length, "No pending simulated driver question")
  const reply: DriverReply = {id:`driver:${i.id}:reply`, terminalEta:input.terminalEta, safe:input.safe, blockers:input.blockers, text:input.text, at:stamp(i)}
  i.driverReplies = [reply]; i.evidence.push({id:reply.id, source:"simulated_driver_reply", at:reply.at, kind:"reported", text:JSON.stringify(reply)})
  i.tasks.push({tool:"receive_driver_reply", args:{}, result:reply, at:stamp(i)})
  i.missing = i.missing.filter(m => !/driver|ETA|reply|response|safety/i.test(m)); i.state = "investigating"; i.nextStep = "Simulated driver reply received; resume investigation against this evidence"; i.stopReason = undefined
  event(i,"driver_reply","A new fictional driver reply arrived; previous question and waiting history retained")
}
export async function runAgent(i: Incident, data: ToolsData, providers: Provider[], checkpoint: () => Promise<void> = async () => {}) {
  requireThat(["investigating", "waiting", "technical_error"].includes(i.state) && !i.executions.length, "Agent cannot run in this state")
  if (waitForPendingDriver(i)) { await checkpoint(); return }
  const deadline = AbortSignal.timeout(90_000)
  i.state = "investigating"; i.lastAgentError = undefined; i.stopReason = undefined
  let corrections = 0
  try {
    requireThat(providers.length > 0, "No configured provider")
    for (let iteration = 0; iteration < 10; iteration++) {
      let call: ToolCall | undefined, turn: ModelTurn | undefined
      for (const provider of providers.slice(0, 2)) {
        for (let attempt = 0; attempt < 2; attempt++) {
          turn = {id:randomUUID(),provider:provider.name,model:provider.model,purpose:"investigate",at:new Date().toISOString()}
          ;(i.modelTurns ??= []).push(turn)
          try {
            call = await provider.choose(structuredClone(i), AbortSignal.any([deadline, AbortSignal.timeout(25_000)]), "investigate")
            turn.selected = {tool:call.tool,args:call.args}; Object.assign(turn,call.metadata)
            i.technical.push({provider:provider.name,model:provider.model}); await checkpoint(); break
          } catch (error) {
            if (call) throw error // A failed persistence checkpoint must not repeat a successful provider call.
            turn.error = error instanceof ProviderFailure ? error.message : "Provider request failed or timed out"
            i.technical.push({provider:provider.name,model:provider.model,error:turn.error}); await checkpoint()
            if (deadline.aborted || (error instanceof ProviderFailure && !error.retryable)) throw error
            if (attempt === 1 && providers.length === 1) throw new Error(turn.error)
            if (attempt === 0 && error instanceof ProviderFailure && error.retryable && error.retryAfterMs > 0) {
              await new Promise<void>((resolve,reject)=>{const timer=setTimeout(resolve,error.retryAfterMs);deadline.addEventListener("abort",()=>{clearTimeout(timer);reject(new Error("Execution time limit"))},{once:true})})
            }
          }
        }
        if (call) break
      }
      requireThat(call && turn, "All configured providers failed")
      deadline.throwIfAborted()
      const before = i.tasks.length
      try { turn.result = await useTool(i,call,data) }
      catch (error) {
        if (!(error instanceof WorkflowError)) throw error
        turn.result = {error:error.message}; i.tasks.push({tool:call.tool,args:call.args,result:turn.result,at:stamp(i)})
        if (++corrections >= 3) throw new WorkflowError(`Tool validation failed: ${error.message}`)
      }
      if (i.tasks.length === before) event(i,"tool_reused",`${call.tool}: reused persisted result; no repeated simulated outreach`)
      await checkpoint()
      if (String(i.state) !== "investigating") {
        i.stopReason = String(i.state) === "needs_decision" ? "Awaiting human approval of the current proposal version" : String(i.state) === "resolved" ? i.summary : i.nextStep
        event(i,"agent_stopped",i.stopReason); await checkpoint(); return
      }
    }
    throw new Error("Iteration limit reached")
  } catch (error) {
    i.state = "technical_error"; i.lastAgentError = error instanceof WorkflowError || error instanceof ProviderFailure ? error.message : error instanceof Error && /limit|HTTP/.test(error.message) ? error.message : "Agent execution failed or exceeded limits"
    i.stopReason = i.lastAgentError; i.nextStep = "Technical failure; review the diagnostic record and explicitly resume. No business conclusion or booking change was made."
    event(i,"technical_error",i.lastAgentError); await checkpoint()
  }
}
export async function explainIncident(i: Incident, question: string, providers: Provider[]) {
  requireThat(typeof question === "string" && question.trim().length > 0 && question.length <= 4000,"Invalid message")
  i.conversation.push({role:"operator",text:question,at:stamp(i)}); i.lastAgentError = undefined
  const p = providers[0], turn: ModelTurn = {id:randomUUID(),provider:p?.name ?? "unconfigured",model:p?.model ?? "unconfigured",purpose:"explain",at:new Date().toISOString()}
  ;(i.modelTurns ??= []).push(turn)
  try {
    requireThat(p,"No configured provider")
    const call = await p.choose(structuredClone(i),AbortSignal.timeout(25_000),"explain")
    turn.selected = {tool:call.tool,args:call.args}; Object.assign(turn,call.metadata)
    requireThat(call.tool === "answer_operator","Explanation may not change the incident")
    argsOnly(call.args,["answer","evidenceIds"])
    const ids = strings(call.args,"evidenceIds"); requireThat(ids.every(id => i.evidence.some(e => e.id === id)),"Explanation cites unknown evidence")
    const answer = text(call.args,"answer"); i.conversation.push({role:"agent",text:answer,at:stamp(i)}); turn.result = {answer,evidenceIds:ids}
  } catch(error) { turn.error = error instanceof WorkflowError || error instanceof ProviderFailure ? error.message : "Explanation provider failed"; i.lastAgentError = turn.error; event(i,"explanation_error",turn.error) }
}
