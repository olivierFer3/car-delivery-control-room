/** Driver access code, rate limit, the shared activity view and the conversation thread (simulated calls only). No network. */
import assert from "node:assert/strict"
import { test } from "node:test"
import { driverCode, driverAuthorized, underHourlyLimit } from "../../lib/driver/access"
import { activitySteps, pendingQuestion, syncThread } from "../../lib/incidents/activity"
import { createIncident } from "../../lib/incidents/engine"
import type { Incident } from "../../lib/incidents/contracts"

test("the driver page code is derived from the operator token and checked in constant time", () => {
  process.env.INCIDENT_OPERATOR_TOKEN = "secret-token-for-test"
  const code = driverCode()!; assert.match(code, /^[a-f0-9]{16}$/); assert.equal(code.includes("secret"), false)
  assert.equal(driverAuthorized(new Request("http://x/api/driver/orders", { headers: { "x-driver-code": code } })), true)
  assert.equal(driverAuthorized(new Request(`http://x/api/driver/orders?k=${code}`)), true)
  assert.equal(driverAuthorized(new Request("http://x/api/driver/orders?k=nope")), false)
  assert.equal(driverAuthorized(new Request("http://x/api/driver/orders")), false)
  delete process.env.INCIDENT_OPERATOR_TOKEN; assert.equal(driverCode(), null)
  const t0 = 1_000_000; for (let n = 0; n < 12; n++) assert.equal(underHourlyLimit(12, t0 + n), true); assert.equal(underHourlyLimit(12, t0 + 20), false); assert.equal(underHourlyLimit(12, t0 + 3_700_000), true)
})
test("agent activity labels where every fact came from, and the conversation is built once", () => {
  const i = createIncident("ord-1", "sig-1", "no_response") as Incident
  i.mode = "llm"; i.driverReport = { text: "Broken down", reportedAt: "2026-10-25T10:00:00Z", driverName: "Test Driver", vehicle: "EV", reference: "CD-1", channel: "driver_app" }
  i.modelTurns = [
    { id: "t1", provider: "groq", model: "m", purpose: "investigate", at: "2026-10-25T10:00:01Z", selected: { tool: "get_order_context", args: {} }, result: { order: {} } },
    { id: "t2", provider: "groq", model: "m", purpose: "investigate", at: "2026-10-25T10:00:02Z", selected: { tool: "check_external_conditions", args: {} }, result: { sources: [{ source: "open-meteo.com", label: "Weather", status: "ok", findings: [{ text: "Gusts 60 km/h", severity: "watch" }] }, { source: "autobahn.de", label: "Roads", status: "unavailable", reason: "HTTP 500", findings: [] }] } },
    { id: "t3", provider: "groq", model: "m", purpose: "investigate", at: "2026-10-25T10:00:03Z", selected: { tool: "check_option_constraints", args: { optionId: "o" } }, result: { feasible: true } },
    { id: "t4", provider: "groq", model: "m", purpose: "investigate", at: "2026-10-25T10:00:04Z", selected: { tool: "ask_driver", args: { question: "ETA?" } } },
  ]
  const steps = activitySteps(i)
  assert.deepEqual(steps.map(s => s.origin), ["dataset", "real", "simulated", "driver"])
  assert.equal(steps[1].findings!.length, 2); assert.match(steps[1].findings![1].text, /unavailable/); assert.equal(steps[3].status, "running")
  i.tasks.push({ tool: "ask_driver", args: { question: "ETA?" }, result: { status: "no_response", question: "ETA?" }, at: "x" }); i.state = "waiting"
  assert.equal(pendingQuestion(i), "ETA?")
  syncThread(i); syncThread(i)
  assert.equal(i.driverMessages!.filter(m => m.id === "agent-question").length, 1)
  i.calls = [{ id: "c1", mode: "test", provider: "test-mode", status: "in_progress", requestedAt: "x", transcript: [{ role: "agent", text: "ETA?" }, { role: "driver", text: "5 hours" }] }]
  syncThread(i); syncThread(i)
  assert.equal(i.driverMessages!.filter(m => m.via === "voice").length, 2)
  i.driverReplies = [{ id: "d", terminalEta: "2026-10-21T14:00:00Z", safe: true, blockers: [], text: "ok", at: "x" }]
  assert.equal(pendingQuestion(i), null)
})
