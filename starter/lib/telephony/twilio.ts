import type { CallSession } from "@/lib/incidents/contracts"
import type { TelephonyConfig } from "./config"
import { TelephonyError } from "./elevenlabs"

type Fetch = typeof fetch
/** Step 1 of a direct call: ElevenLabs returns the TwiML that connects the Twilio call to the voice agent. */
export async function registerCall(cfg: TelephonyConfig, variables: Record<string, string>, f: Fetch = fetch): Promise<string> {
  let response: Response
  try {
    response = await f(`${cfg.base}/v1/convai/twilio/register-call`, { method: "POST", headers: { "xi-api-key": cfg.apiKey, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ agent_id: cfg.agentId, from_number: cfg.twilio!.from, to_number: cfg.to, direction: "outbound", conversation_initiation_client_data: { dynamic_variables: variables } }) })
  } catch { throw new TelephonyError("The voice provider did not answer. No call was placed.") }
  if (!response.ok) throw new TelephonyError(response.status === 401 || response.status === 403 ? "The voice provider rejected the API key." : response.status === 404 || response.status === 422 ? "The voice provider rejected the voice agent (check ELEVENLABS_AGENT_ID)." : `The voice provider returned HTTP ${response.status}.`)
  let text = await response.text()
  try { const parsed = JSON.parse(text); if (typeof parsed === "string") text = parsed } catch { /* already plain TwiML */ }
  if (!/<Response[\s>]/.test(text) || !/<Connect/.test(text)) throw new TelephonyError("The voice provider did not return connection instructions for the call.")
  return text
}
const basic = (a: { user: string; secret: string }) => `Basic ${Buffer.from(`${a.user}:${a.secret}`).toString("base64")}`
function twilioFail(status: number): TelephonyError {
  return new TelephonyError(status === 401 ? "Twilio rejected the credentials (check the account SID and the token or API key)." : status === 403 ? "Twilio refused the request (for example a trial account may only call verified numbers)." : status === 400 ? "Twilio rejected the call request (check the Twilio number and the destination)." : `Twilio returned HTTP ${status}.`)
}
/** Step 2: Twilio places the call to the fixed test number. TimeLimit is a hard cap on billable seconds. */
export async function createTwilioCall(cfg: TelephonyConfig, twiml: string, f: Fetch = fetch): Promise<{ callSid: string }> {
  const t = cfg.twilio!
  const form = new URLSearchParams({ To: cfg.to, From: t.from, Twiml: twiml, Timeout: String(cfg.ringingTimeoutSecs), TimeLimit: String(cfg.maxCallSecs) })
  let response: Response
  try { response = await f(`https://api.twilio.com/2010-04-01/Accounts/${t.accountSid}/Calls.json`, { method: "POST", headers: { Authorization: basic(t), "Content-Type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(15_000) }) }
  catch { throw new TelephonyError("Twilio did not answer. No call was placed.") }
  if (!response.ok) throw twilioFail(response.status)
  const body = await response.json() as { sid?: string }
  if (typeof body.sid !== "string" || !/^CA[0-9a-f]{32}$/i.test(body.sid)) throw new TelephonyError("Twilio did not confirm the call.")
  return { callSid: body.sid }
}
export async function fetchTwilioCall(cfg: TelephonyConfig, callSid: string, f: Fetch = fetch) {
  const t = cfg.twilio!
  const response = await f(`https://api.twilio.com/2010-04-01/Accounts/${t.accountSid}/Calls/${encodeURIComponent(callSid)}.json`, { headers: { Authorization: basic(t) }, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw twilioFail(response.status)
  const b = await response.json() as { status?: string; duration?: string | null; price?: string | null; price_unit?: string | null }
  const status = String(b.status ?? "")
  const mapped: { status: CallSession["status"] | "failed"; failure?: string } =
    status === "queued" || status === "ringing" ? { status: "ringing" } : status === "in-progress" ? { status: "in_progress" } : status === "completed" ? { status: "processing" }
    : status === "busy" ? { status: "failed", failure: "The line was busy." } : status === "no-answer" ? { status: "failed", failure: "Nobody answered." }
    : status === "canceled" ? { status: "failed", failure: "The call was canceled." } : status === "failed" ? { status: "failed", failure: "Twilio could not connect the call." } : { status: "ringing" }
  return { ...mapped, twilioStatus: status, durationSecs: b.duration ? Number(b.duration) : undefined, price: b.price ? `${b.price} ${b.price_unit ?? ""}`.trim() : undefined }
}
/** The voice agent's conversation for this call: matched by the call reference we passed as a dynamic variable (or Twilio's call SID). */
export async function findConversation(cfg: TelephonyConfig, callRef: string, callSid: string | undefined, sinceUnix: number, f: Fetch = fetch): Promise<string | null> {
  const headers = { "xi-api-key": cfg.apiKey }
  const list = await f(`${cfg.base}/v1/convai/conversations?agent_id=${encodeURIComponent(cfg.agentId)}&call_start_after_unix=${sinceUnix}&page_size=10`, { headers, signal: AbortSignal.timeout(15_000) })
  if (!list.ok) return null
  const items = ((await list.json()) as { conversations?: { conversation_id?: string }[] }).conversations ?? []
  for (const c of items.slice(0, 6)) {
    if (!c.conversation_id) continue
    const r = await f(`${cfg.base}/v1/convai/conversations/${encodeURIComponent(c.conversation_id)}`, { headers, signal: AbortSignal.timeout(15_000) })
    if (!r.ok) continue
    const d = await r.json() as { conversation_initiation_client_data?: { dynamic_variables?: Record<string, unknown> }; metadata?: { phone_call?: { call_sid?: string } } }
    if (d.conversation_initiation_client_data?.dynamic_variables?.call_ref === callRef || (callSid && d.metadata?.phone_call?.call_sid === callSid)) return c.conversation_id
  }
  return null
}
