import type { Incident } from "./contracts"
import { useTool, type ToolsData, WorkflowError } from "./engine"
/** Explicit iteration-1 fixture, never represented as LLM investigation. */
export async function mockProposal(i: Incident, data: ToolsData) {
  if (!["investigating", "waiting", "technical_error"].includes(i.state) || i.executions.length) throw new WorkflowError("Mock cannot run in this state")
  i.state = "investigating"
  await useTool(i, { tool: "get_order_context", args: {} }, data)
  await useTool(i, { tool: "ask_driver", args: { question: "What is your terminal ETA?" } }, data)
  if (String(i.state) === "waiting") return
  if (i.scenario === "disproved") { await useTool(i, { tool: "close_disproved_alert", args: { reason: "Simulated follow-up disproves delay; no delivery conclusion" } }, data); return }
  if (i.contradictions.length) { await useTool(i, { tool: "wait", args: { reason: "Conflicting simulated ETA reports", missing: ["Verified terminal ETA"], contradictions: [] } }, data); return }
  const c = await data.context(i.orderId)
  if (!c) throw new WorkflowError("Order not found")
  await useTool(i, { tool: "search_travel_options", args: {} }, data)
  for (const o of c.options.filter(o => o.kind === "FERRY")) {
    if (i.proposals.some(p => p.actions.some(a => a.optionId === o.id))) continue
    const check = await useTool(i, { tool: "check_option_constraints", args: { optionId: o.id } }, data) as { feasible: boolean }
    const r = c.reservations.find(r => r.kind === "FERRY" && r.status === "BOOKED" && r.assignment_id === o.assignment_id)
    if (check.feasible && r) {
      await useTool(i, { tool: "create_proposal", args: { optionId: o.id, reservationId: r.id, summary: "Mock: move the fictional ferry booking", consequences: `Simulated quote ${o.quote_cents} minor units ${o.currency}; departure ${o.departure_at}, arrival ${o.arrival_at}. Customer promise unchanged. Quote is not live capacity.`, evidenceIds: [o.id, r.id, `driver:${i.id}`] } }, data); return
    }
  }
  await useTool(i, { tool: "wait", args: { reason: "No checked ferry alternative in supplied snapshot; await fictional capacity and fare confirmation", missing: ["Suitable ferry quote"], contradictions: [] } }, data)
}
