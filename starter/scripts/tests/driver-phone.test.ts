/** Telephony gating, ElevenLabs request shape (mocked network), transcript mapping, driver access and the shared activity view. No real call, no paid request. */
import assert from "node:assert/strict"
import { test } from "node:test"
import { telephonyStatus, maskNumber, cleanAgentId, twilioAuth } from "../../lib/telephony/config"
import { createTwilioCall, fetchTwilioCall, findConversation, registerCall } from "../../lib/telephony/twilio"
import { fetchConversation, startOutboundCall, TelephonyError } from "../../lib/telephony/elevenlabs"
import { driverCode, driverAuthorized, underHourlyLimit } from "../../lib/driver/access"
import { activitySteps, pendingQuestion, syncThread } from "../../lib/incidents/activity"
import { createIncident } from "../../lib/incidents/engine"
import type { Incident } from "../../lib/incidents/contracts"

const FULL = { ELEVENLABS_API_KEY: "k", ELEVENLABS_AGENT_ID: "agent_abcdefghij1234567890", ELEVENLABS_PHONE_NUMBER_ID: "phnum_x", DRIVER_TEST_PHONE: "+4915112345678", TELEPHONY_LIVE_ENABLED: "true" } as unknown as NodeJS.ProcessEnv

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
  assert.equal(body.to_number, "+4915112345678"); assert.equal(body.agent_id, "agent_abcdefghij1234567890"); assert.equal(body.agent_phone_number_id, "phnum_x")
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

const DIRECT = { ELEVENLABS_API_KEY: "k", ELEVENLABS_AGENT_ID: "agent_abcdefghij1234567890?branchId=agtbrch_zzz", DRIVER_TEST_PHONE: "+358401234274", TELEPHONY_LIVE_ENABLED: "true",
  TWILIO_ACCOUNT_SID: `AC${"a".repeat(32)}`, TWILIO_API_KEY_SID: `SK${"b".repeat(32)}`, TWILIO_API_KEY: "s".repeat(32), TWILIO_PHONE_NUMBER: "+12025550123" } as unknown as NodeJS.ProcessEnv
test("direct Twilio mode: provider choice, credential shapes and a pasted agent URL (code paths only; no network)", () => {
  assert.equal(cleanAgentId("agent_abc123?branchId=agtbrch_x"), "agent_abc123")
  const s = telephonyStatus(DIRECT); assert.equal(s.mode, "live"); assert.equal(s.provider, "twilio-direct"); assert.equal(s.config!.agentId, "agent_abcdefghij1234567890"); assert.equal(s.config!.twilio!.user, `SK${"b".repeat(32)}`); assert.equal(s.config!.maxCallSecs, 150)
  assert.equal(telephonyStatus({ ...DIRECT, TWILIO_AUTH_TOKEN: "t".repeat(32) }).config!.twilio!.user, `AC${"a".repeat(32)}`, "an auth token authenticates as the account SID")
  assert.equal(telephonyStatus({ ...DIRECT, TELEPHONY_PROVIDER: "elevenlabs-twilio" }).mode, "test", "native mode needs ELEVENLABS_PHONE_NUMBER_ID")
  for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_API_KEY_SID", "TWILIO_PHONE_NUMBER", "TELEPHONY_LIVE_ENABLED", "DRIVER_TEST_PHONE"]) { const env = { ...DIRECT } as Record<string, string | undefined>; delete env[key]; assert.equal(telephonyStatus(env as unknown as NodeJS.ProcessEnv).mode, "test", `${key} missing must stay in test mode`) }
  assert.equal(twilioAuth({ TWILIO_API_KEY: "s".repeat(32) } as unknown as NodeJS.ProcessEnv).auth, null)
  assert.equal(telephonyStatus({ ...DIRECT, TELEPHONY_MAX_CALL_SECONDS: "9999" }).config!.maxCallSecs, 300)
})
test("direct Twilio mode: request shapes against a mocked network", async () => {
  const cfg = telephonyStatus(DIRECT).config!
  let reg: RequestInit | undefined
  const twiml = '<?xml version="1.0"?><Response><Connect><Stream url="wss://x"/></Connect></Response>'
  const twimlOnly = (async (_u: string, init: RequestInit) => { reg = init; return new Response(twiml, { status: 200 }) }) as unknown as typeof fetch
  assert.equal(await registerCall(cfg, { call_ref: "c1" }, twimlOnly), twiml)
  const rb = JSON.parse(String(reg!.body)); assert.equal(rb.direction, "outbound"); assert.equal(rb.to_number, "+358401234274"); assert.equal(rb.from_number, "+12025550123"); assert.equal(rb.conversation_initiation_client_data.dynamic_variables.call_ref, "c1")
  assert.equal(await registerCall(cfg, {}, (async () => new Response(JSON.stringify(twiml), { status: 200 })) as unknown as typeof fetch), twiml, "a JSON-quoted string is accepted")
  await assert.rejects(registerCall(cfg, {}, (async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch), /connection instructions/)
  let call: { url: string; init: RequestInit } | undefined
  const tw = (async (url: string, init: RequestInit) => { call = { url, init }; return new Response(JSON.stringify({ sid: `CA${"c".repeat(32)}` }), { status: 201 }) }) as unknown as typeof fetch
  assert.deepEqual(await createTwilioCall(cfg, twiml, tw), { callSid: `CA${"c".repeat(32)}` })
  assert.equal(call!.url, `https://api.twilio.com/2010-04-01/Accounts/AC${"a".repeat(32)}/Calls.json`)
  const form = call!.init.body as URLSearchParams; assert.equal(form.get("To"), "+358401234274"); assert.equal(form.get("From"), "+12025550123"); assert.equal(form.get("TimeLimit"), "150"); assert.equal(form.get("Twiml"), twiml)
  assert.match((call!.init.headers as Record<string, string>).Authorization, /^Basic /)
  await assert.rejects(createTwilioCall(cfg, twiml, (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch), /credentials/)
  await assert.rejects(createTwilioCall(cfg, twiml, (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch), /trial/)
  const status = (st: string) => (async () => new Response(JSON.stringify({ status: st, duration: "42", price: "-0.0900", price_unit: "USD" }), { status: 200 })) as unknown as typeof fetch
  assert.equal((await fetchTwilioCall(cfg, "CA1", status("ringing"))).status, "ringing")
  assert.equal((await fetchTwilioCall(cfg, "CA1", status("in-progress"))).status, "in_progress")
  const done = await fetchTwilioCall(cfg, "CA1", status("completed")); assert.equal(done.status, "processing"); assert.equal(done.durationSecs, 42); assert.equal(done.price, "-0.0900 USD")
  assert.deepEqual([(await fetchTwilioCall(cfg, "CA1", status("no-answer"))).failure, (await fetchTwilioCall(cfg, "CA1", status("busy"))).failure], ["Nobody answered.", "The line was busy."])
  const conv = (async (url: string) => url.includes("page_size") ? new Response(JSON.stringify({ conversations: [{ conversation_id: "other" }, { conversation_id: "mine" }] })) : new Response(JSON.stringify({ conversation_initiation_client_data: { dynamic_variables: { call_ref: url.endsWith("mine") ? "c1" : "zzz" } } }))) as unknown as typeof fetch
  assert.equal(await findConversation(cfg, "c1", undefined, 0, conv), "mine"); assert.equal(await findConversation(cfg, "nope", undefined, 0, conv), null)
})
