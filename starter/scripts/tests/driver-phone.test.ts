/** Telephony gating, ElevenLabs request shape (mocked network), transcript mapping, driver access and the shared activity view. No real call, no paid request. */
import assert from "node:assert/strict"
import { test } from "node:test"
import { telephonyStatus, maskNumber } from "../../lib/telephony/config"
import { fetchConversation, startOutboundCall, TelephonyError } from "../../lib/telephony/elevenlabs"
import { driverCode, driverAuthorized, underHourlyLimit } from "../../lib/driver/access"
import { activitySteps, pendingQuestion, syncThread } from "../../lib/incidents/activity"
import { createIncident } from "../../lib/incidents/engine"
import type { Incident } from "../../lib/incidents/contracts"

const FULL = { ELEVENLABS_API_KEY: "k", ELEVENLABS_AGENT_ID: "agent_x", ELEVENLABS_PHONE_NUMBER_ID: "phnum_x", DRIVER_TEST_PHONE: "+4915112345678", TELEPHONY_LIVE_ENABLED: "true" } as unknown as NodeJS.ProcessEnv

test("calls stay in test mode until every credential AND the explicit authorization are present", () => {
  assert.equal(telephonyStatus({} as NodeJS.ProcessEnv).mode, "test")
  assert.equal(telephonyStatus(FULL).mode, "live")
  for (const key of Object.keys(FULL)) { const env = { ...FULL }; delete env[key]; const s = telephonyStatus(env); assert.equal(s.mode, "test", `${key} missing must not go live`); assert.equal(s.config, null) }
  assert.equal(telephonyStatus({ ...FULL, TELEPHONY_LIVE_ENABLED: "yes" }).mode, "test")
  assert.equal(telephonyStatus({ ...FULL, DRIVER_TEST_PHONE: "0151 1234" }).mode, "test")
  assert.match(telephonyStatus(FULL).toMasked!, /^\+49 •+ 678$/)
  assert.equal(maskNumber("+4915112345678").includes("1511"), false)
})
test("the outbound call request uses the configured number only and carries the case as dynamic variables", async () => {
  const live = telephonyStatus(FULL).config!
  let seen: { url: string; init: RequestInit } | undefined
  const f = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(JSON.stringify({ success: true, message: "ok", conversation_id: "conv_1", callSid: "CA1" }), { status: 200 }) }) as unknown as typeof fetch
  const r = await startOutboundCall(live, { driver_name: "Nadia", agent_question: "ETA?" }, f)
  assert.deepEqual(r, { conversationId: "conv_1", callSid: "CA1" })
  assert.equal(seen!.url, "https://api.elevenlabs.io/v1/convai/twilio/outbound-call")
  const headers = seen!.init.headers as Record<string, string>; assert.equal(headers["xi-api-key"], "k")
  const body = JSON.parse(String(seen!.init.body))
  assert.equal(body.to_number, "+4915112345678"); assert.equal(body.agent_id, "agent_x"); assert.equal(body.agent_phone_number_id, "phnum_x")
  assert.equal(body.conversation_initiation_client_data.dynamic_variables.agent_question, "ETA?")
  const bad = (async () => new Response("{}", { status: 422 })) as unknown as typeof fetch
  await assert.rejects(startOutboundCall(live, {}, bad), TelephonyError)
  const refused = (async () => new Response(JSON.stringify({ success: false, message: "no" }), { status: 200 })) as unknown as typeof fetch
  await assert.rejects(startOutboundCall(live, {}, refused), /not started/)
})
test("conversation status and transcript map to the call model", async () => {
  const live = telephonyStatus(FULL).config!
  const f = (async () => new Response(JSON.stringify({ status: "done", transcript: [{ role: "agent", message: "Hello", time_in_call_secs: 1 }, { role: "user", message: "About five hours", time_in_call_secs: 4 }, { role: "user", message: null }] }), { status: 200 })) as unknown as typeof fetch
  const c = await fetchConversation(live, "conv_1", f)
  assert.equal(c.status, "completed"); assert.deepEqual(c.transcript.map(l => l.role), ["agent", "driver"])
  for (const [raw, mapped] of [["initiated", "ringing"], ["in-progress", "in_progress"], ["processing", "processing"], ["failed", "failed"]] as const)
    assert.equal((await fetchConversation(live, "c", (async () => new Response(JSON.stringify({ status: raw, transcript: [] }))) as unknown as typeof fetch)).status, mapped)
})
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
  i.calls = [{ id: "c1", mode: "test", provider: "test-mode", status: "in_progress", toMasked: "test", requestedAt: "x", transcript: [{ role: "agent", text: "ETA?" }, { role: "driver", text: "5 hours" }] }]
  syncThread(i); syncThread(i)
  assert.equal(i.driverMessages!.filter(m => m.via === "voice").length, 2)
  i.driverReplies = [{ id: "d", terminalEta: "2026-10-21T14:00:00Z", safe: true, blockers: [], text: "ok", at: "x" }]
  assert.equal(pendingQuestion(i), null)
})
