import { test } from "node:test"
import assert from "node:assert/strict"
import { createIncident, decide, executeApproved, runAgent, useTool, type Context, type ToolsData } from "../../lib/incidents/engine"
import { mockProposal } from "../../lib/incidents/mock"
import { GeminiProvider } from "../../lib/incidents/providers"
import { authorize, publicIncident } from "../../lib/incidents/http"
import type { Incident, Provider } from "../../lib/incidents/contracts"
const context: Context = { order: { id: "order" }, alerts: [{ id: "signal", triggered_at: "2026-10-21T08:00:00Z" }], messages: [], reservations: [{ id: "reservation", kind: "FERRY", status: "BOOKED", assignment_id: "driver", check_in_cutoff_at: "2026-10-21T12:00:00Z" }], options: [1, 2].map(n => ({ id: `option${n}`, kind: "FERRY", assignment_id: "driver", status: "AVAILABLE_QUOTE", check_in_cutoff_at: `2026-10-${21+n}T12:00:00Z`, departure_at: `2026-10-${21+n}T14:00:00Z`, arrival_at: `2026-10-${22+n}T14:00:00Z`, quote_cents: n * 20000, currency: "EUR" })) }
const data: ToolsData = { context: async () => structuredClone(context), similar: async () => [] }
function incident(scenario: Incident["scenario"] = "delay") { return createIncident("order", "signal", scenario) }
function approval(i: Incident, version = i.proposals.at(-1)!.version) { decide(i, { command: "decide", version, choice: "approve", operator: "demo-operator", comment: "Reviewed exact actions" }) }
test("mock proposal → approval → visible result, duplicate prevention", async () => {
  const i = incident(); await mockProposal(i, data); assert.equal(i.state, "needs_decision"); assert.equal(i.executions.length, 0)
  approval(i); assert.equal(i.state, "approved"); assert.equal(i.executions.length, 0)
  const result = executeApproved(i, 1); assert.equal(result.status, "succeeded"); assert.equal(result.effects[0].costCents, 20000)
  assert.deepEqual(executeApproved(i, 1), result); assert.equal(i.executions.length, 1); assert.equal(i.state, "resolved"); assert.match(i.nextStep, /does not prove delivery/)
})
test("disproved alert uses current booking cutoff", async () => { const i = incident("disproved"); await mockProposal(i, data); assert.equal(i.state, "resolved"); assert.equal(i.proposals.length, 0) })
test("driver silence retains waiting state and missing information", async () => { const i = incident("no_response"); await mockProposal(i, data); assert.equal(i.state, "waiting"); assert.deepEqual(i.missing, ["Current driver ETA"]); assert.equal(JSON.parse(JSON.stringify(i)).state, "waiting") })
test("contradictory sources block a proposal", async () => { const i = incident("contradiction"); await mockProposal(i, data); assert.equal(i.state, "waiting"); assert.equal(i.proposals.length, 0); assert.equal(i.contradictions.length, 1) })
test("rejection, alternative and stale approvals", async () => {
  const i = incident(); await mockProposal(i, data); decide(i, { command: "decide", version: 1, choice: "reject", operator: "operator", comment: "Too expensive" })
  assert.throws(() => executeApproved(i, 1), /approval/)
  await mockProposal(i, data); assert.equal(i.proposals.length, 2)
  assert.throws(() => decide(i, { command: "decide", version: 1, choice: "approve", operator: "op", comment: "" }), /Stale/)
  decide(i, { command: "decide", version: 2, choice: "alternative", operator: "op", comment: "Find another" }); assert.equal(i.state, "investigating"); assert.throws(() => executeApproved(i, 2), /approval/)
})
test("unapproved action, invented tool and cross-order arguments blocked", async () => {
  const i = incident(); await mockProposal(i, data); assert.throws(() => executeApproved(i, 1), /approval/); i.state = "investigating"
  await assert.rejects(() => useTool(i, { tool: "execute_approved_proposal", args: { approved: true } }, data), /not permitted/)
  await assert.rejects(() => useTool(i, { tool: "get_order_context", args: { orderId: "another" } }, data), /Unexpected/)
})
test("provider failure and fallback do not resend a driver question", async () => {
  const i = incident(); await useTool(i, { tool: "get_order_context", args: {} }, data); await useTool(i, { tool: "ask_driver", args: { question: "ETA?" } }, data)
  const bad: Provider = { name: "failed", model: "test", choose: async () => { throw new Error("down") } }
  await runAgent(i, data, [bad]); assert.equal(i.state, "technical_error"); assert.equal(i.proposals.length, 0)
  let n = 0; const good: Provider = { name: "fallback", model: "test", choose: async () => ++n === 1 ? { tool: "ask_driver", args: { question: "ETA again?" } } : { tool: "wait", args: { reason: "Need quote", missing: ["Quote"], contradictions: [] } } }
  await runAgent(i, data, [bad, good]); assert.equal(i.state, "waiting"); assert.equal(i.tasks.filter(t => t.tool === "ask_driver").length, 1)
})
test("iteration limit and execution failure stay technical", async () => {
  const i = incident(); await runAgent(i, data, [{ name: "loop", model: "test", choose: async () => ({ tool: "search_travel_options", args: {} }) }]); assert.equal(i.state, "technical_error"); assert.equal(i.tasks.length, 10)
  const j = incident(); await mockProposal(j, data); approval(j); executeApproved(j, 1, true); assert.equal(j.state, "technical_error"); assert.equal(j.decisions[0].choice, "approve"); assert.equal(j.executions[0].effects.length, 0)
})
test("no provider yields technical error", async () => { const i = incident(); await runAgent(i, data, []); assert.equal(i.state, "technical_error") })
test("Gemini HTTP contract parses tool choice and supplies abort signal", async () => {
  const original = globalThis.fetch; let sent: Record<string, unknown> | undefined
  globalThis.fetch = async (_url, init) => { sent = JSON.parse(String(init?.body)); assert.ok(init?.signal); return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ tool: "get_order_context", args: {} }) }] } }] }) }
  try { const call = await new GeminiProvider("gemini-2.5-flash", "fictional-key").choose(incident(), AbortSignal.timeout(1000)); assert.equal(call.tool, "get_order_context"); assert.ok(sent?.contents) } finally { globalThis.fetch = original }
})
test("operator token and secondary technical view", () => {
  const before = process.env.INCIDENT_OPERATOR_TOKEN; process.env.INCIDENT_OPERATOR_TOKEN = "test-secret"
  try { assert.equal(authorize(new Request("http://localhost")), false); assert.equal(authorize(new Request("http://localhost", { headers: { authorization: "Bearer test-secret" } })), true); assert.equal("technical" in publicIncident(incident()), false) }
  finally { if (before === undefined) delete process.env.INCIDENT_OPERATOR_TOKEN; else process.env.INCIDENT_OPERATOR_TOKEN = before }
})

test("Grok Responses API uses shared tool contract without external tools", async () => {
  const { GrokProvider } = await import("../../lib/incidents/providers")
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://api.x.ai/v1/responses")
    const body = JSON.parse(String(init?.body))
    assert.equal(body.model, "grok-4.7"); assert.equal(body.store, false); assert.equal(body.tools, undefined)
    return Response.json({ output: [{ type: "message", content: [{ type: "output_text", text: '{"tool":"get_order_context","args":{}}' }] }] })
  }
  try { assert.equal((await new GrokProvider("grok-4.7", "fake").choose(incident(), AbortSignal.timeout(1000))).tool, "get_order_context") }
  finally { globalThis.fetch = original }
})
test("non-retryable provider errors do not trigger fallback", async () => {
  const { ProviderFailure } = await import("../../lib/incidents/providers")
  let fallbackCalls = 0
  const i = incident()
  await runAgent(i, data, [
    { name: "bad", model: "test", choose: async () => { throw new ProviderFailure("Invalid credentials", false) } },
    { name: "fallback", model: "test", choose: async () => { fallbackCalls++; return { tool: "get_order_context", args: {} } } },
  ])
  assert.equal(i.state, "technical_error"); assert.equal(fallbackCalls, 0)
})
test("supervisor loop receives results before choosing the next tool", async () => {
  const i = incident()
  const choices = [
    { tool: "get_order_context", args: {} },
    { tool: "ask_driver", args: { question: "ETA?" } },
    { tool: "search_travel_options", args: {} },
    { tool: "check_option_constraints", args: { optionId: "option1" } },
    { tool: "create_proposal", args: { optionId: "option1", reservationId: "reservation", summary: "Later ferry", consequences: "200 EUR; later arrival", evidenceIds: ["option1", "reservation", `driver:${i.id}`] } },
  ]
  let n = 0
  await runAgent(i, data, [{ name: "contract-test", model: "test", choose: async snapshot => {
    assert.equal(snapshot.tasks.length, n)
    return choices[n++]
  } }])
  assert.equal(i.state, "needs_decision"); assert.equal(i.tasks.length, 5); assert.equal(i.executions.length, 0)
})

test("operator sessions reject expired, altered and rotated-token cookies", async () => {
  const { issueSession, validSession, tokenMatches } = await import("../../lib/incidents/operator-session")
  const token = "fictional-session-secret", now = 1000
  const session = issueSession(token, now)
  assert.equal(validSession(session, token, now), true)
  assert.equal(validSession(session + "altered", token, now), false)
  assert.equal(validSession(session, "rotated-secret", now), false)
  assert.equal(validSession(session, token, now + 8 * 60 * 60 * 1000), false)
  assert.equal(validSession(undefined, token, now), false)
  assert.equal(tokenMatches("é", "a"), false)
})
