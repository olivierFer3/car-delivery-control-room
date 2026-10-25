import type { CallSession } from "@/lib/incidents/contracts"
import type { TelephonyConfig } from "./config"

type Fetch = typeof fetch
export class TelephonyError extends Error {}
async function call(f: Fetch, cfg: TelephonyConfig, path: string, init: RequestInit) {
  let response: Response
  try { response = await f(`${cfg.base}${path}`, { ...init, headers: { "xi-api-key": cfg.apiKey, "Content-Type": "application/json" }, signal: AbortSignal.timeout(15_000) }) }
  catch { throw new TelephonyError("The voice provider did not answer. No call was placed.") }
  if (!response.ok) throw new TelephonyError(response.status === 401 || response.status === 403 ? "The voice provider rejected the API key." : response.status === 422 ? "The voice provider rejected the call request (check agent, phone number id and number)." : `The voice provider returned HTTP ${response.status}.`)
  return response.json() as Promise<Record<string, unknown>>
}
/** ElevenLabs Agents outbound call through a Twilio number imported into ElevenLabs. This is a chargeable real phone call. */
export async function startOutboundCall(cfg: TelephonyConfig, variables: Record<string, string>, f: Fetch = fetch) {
  const body = await call(f, cfg, "/v1/convai/twilio/outbound-call", { method: "POST", body: JSON.stringify({
    agent_id: cfg.agentId, agent_phone_number_id: cfg.phoneNumberId, to_number: cfg.to,
    conversation_initiation_client_data: { dynamic_variables: variables },
    telephony_call_config: { ringing_timeout_secs: cfg.ringingTimeoutSecs },
  }) })
  if (body.success !== true || typeof body.conversation_id !== "string") throw new TelephonyError(typeof body.message === "string" ? `The call was not started: ${body.message}` : "The call was not started.")
  return { conversationId: body.conversation_id, callSid: typeof body.callSid === "string" ? body.callSid : undefined }
}
export async function fetchConversation(cfg: TelephonyConfig, conversationId: string, f: Fetch = fetch) {
  const b = await call(f, cfg, `/v1/convai/conversations/${encodeURIComponent(conversationId)}`, { method: "GET" })
  const status = String(b.status ?? "")
  const transcript: CallSession["transcript"] = (Array.isArray(b.transcript) ? b.transcript : [])
    .map((x: { role?: string; message?: string | null; time_in_call_secs?: number }) => ({ role: x.role === "agent" ? "agent" as const : "driver" as const, text: (x.message ?? "").trim(), t: x.time_in_call_secs }))
    .filter(x => x.text)
  const meta = (b.metadata ?? {}) as { call_duration_secs?: number; termination_reason?: string }
  const next: CallSession["status"] = status === "done" ? "completed" : status === "failed" ? "failed" : status === "processing" ? "processing" : status === "in-progress" ? "in_progress" : "ringing"
  return { status: next, transcript, durationSecs: meta.call_duration_secs, termination: meta.termination_reason }
}
