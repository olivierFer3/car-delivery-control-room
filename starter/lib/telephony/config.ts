/** Telephony is OFF unless every live setting is present AND TELEPHONY_LIVE_ENABLED=true.
 *  The number that rings is fixed server-side (DRIVER_TEST_PHONE): the browser can never choose who is called.
 *  Two ways to reach the same ElevenLabs voice agent:
 *   - "twilio-direct": this server asks ElevenLabs for the connecting TwiML (register-call) and places the call with the Twilio API itself,
 *     so Twilio's own call status and price are visible. Needs a Twilio account SID, an auth token or API key, and a Twilio number.
 *   - "elevenlabs-twilio": the Twilio number is imported into ElevenLabs and ElevenLabs places the call (needs ELEVENLABS_PHONE_NUMBER_ID). */
export type TwilioAuth = { accountSid: string; user: string; secret: string; from: string }
export type TelephonyConfig = {
  provider: "twilio-direct" | "elevenlabs-twilio"; apiKey: string; agentId: string; phoneNumberId?: string; to: string
  base: string; ringingTimeoutSecs: number; maxCallSecs: number; twilio?: TwilioAuth
}
const E164 = /^\+[1-9]\d{7,14}$/
export function maskNumber(n: string) { return n.length > 6 ? `${n.slice(0, 3)} ${"•".repeat(Math.max(2, n.length - 6))} ${n.slice(-3)}` : "•••" }
/** A pasted dashboard URL ("agent_...?branchId=...") must not reach the API: keep only the id itself. */
export function cleanAgentId(raw: string | undefined): string { return (raw ?? "").trim().split(/[?&#\s]/)[0] }
export function twilioAuth(env: NodeJS.ProcessEnv): { auth: TwilioAuth | null; missing: string[] } {
  const sid = env.TWILIO_ACCOUNT_SID?.trim() ?? "", token = env.TWILIO_AUTH_TOKEN?.trim() ?? ""
  const keySid = env.TWILIO_API_KEY_SID?.trim() ?? "", keySecret = (env.TWILIO_API_KEY_SECRET ?? env.TWILIO_API_KEY)?.trim() ?? ""
  const from = env.TWILIO_PHONE_NUMBER?.trim() ?? ""
  const missing: string[] = []
  if (!/^AC[0-9a-fA-F]{32}$/.test(sid)) missing.push("TWILIO_ACCOUNT_SID (AC followed by 32 characters)")
  const useToken = !!token, useKey = !useToken && !!keySecret
  if (!useToken && !useKey) missing.push("TWILIO_AUTH_TOKEN, or TWILIO_API_KEY_SID plus its secret")
  if (useKey && !/^SK[0-9a-fA-F]{32}$/.test(keySid)) missing.push("TWILIO_API_KEY_SID (SK followed by 32 characters, the SID that belongs to the API key secret)")
  if (!E164.test(from)) missing.push("TWILIO_PHONE_NUMBER (your Twilio number, E.164)")
  return { auth: missing.length ? null : { accountSid: sid, user: useToken ? sid : keySid, secret: useToken ? token : keySecret, from }, missing }
}
export function telephonyStatus(env: NodeJS.ProcessEnv = process.env) {
  const missing: string[] = []
  const apiKey = env.ELEVENLABS_API_KEY?.trim() ?? "", agentId = cleanAgentId(env.ELEVENLABS_AGENT_ID), phoneNumberId = env.ELEVENLABS_PHONE_NUMBER_ID?.trim() ?? ""
  const phone = env.DRIVER_TEST_PHONE?.trim() ?? ""
  if (!apiKey) missing.push("ELEVENLABS_API_KEY")
  if (!agentId) missing.push("ELEVENLABS_AGENT_ID"); else if (!/^agent_[A-Za-z0-9]{10,60}$/.test(agentId)) missing.push("ELEVENLABS_AGENT_ID (must be just agent_..., without anything after it)")
  if (!phone) missing.push("DRIVER_TEST_PHONE"); else if (!E164.test(phone)) missing.push("DRIVER_TEST_PHONE (must be E.164, e.g. +4915112345678)")
  const tw = twilioAuth(env)
  const wanted: "twilio-direct" | "elevenlabs-twilio" | null = env.TELEPHONY_PROVIDER === "elevenlabs-twilio" ? "elevenlabs-twilio" : env.TELEPHONY_PROVIDER === "twilio-direct" ? "twilio-direct" : tw.auth ? "twilio-direct" : phoneNumberId ? "elevenlabs-twilio" : null
  if (wanted === "elevenlabs-twilio" && !phoneNumberId) missing.push("ELEVENLABS_PHONE_NUMBER_ID")
  if (wanted === "twilio-direct" && !tw.auth) missing.push(...tw.missing.map(m => `${m} [direct Twilio]`))
  if (!wanted) missing.push(`Twilio: ${tw.missing.join("; ")}`, "or ELEVENLABS_PHONE_NUMBER_ID (a Twilio number imported into ElevenLabs)")
  if (env.TELEPHONY_LIVE_ENABLED !== "true") missing.push("TELEPHONY_LIVE_ENABLED=true (explicit authorization to place chargeable calls)")
  const live = missing.length === 0
  const maxCall = Math.min(300, Math.max(30, Number(env.TELEPHONY_MAX_CALL_SECONDS) || 150))
  return {
    mode: live ? ("live" as const) : ("test" as const), liveReady: live, missing, provider: wanted,
    toMasked: phone && E164.test(phone) ? maskNumber(phone) : null,
    config: live ? ({ provider: wanted!, apiKey, agentId, phoneNumberId: phoneNumberId || undefined, to: phone, base: (env.ELEVENLABS_API_BASE ?? "https://api.elevenlabs.io").replace(/\/$/, ""), ringingTimeoutSecs: 40, maxCallSecs: maxCall, twilio: tw.auth ?? undefined } as TelephonyConfig) : null,
  }
}
