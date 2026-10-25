/** Telephony is OFF unless every live setting is present AND TELEPHONY_LIVE_ENABLED=true.
 *  The number that rings is fixed server-side (DRIVER_TEST_PHONE): the browser can never choose who is called. */
export type TelephonyConfig = { apiKey: string; agentId: string; phoneNumberId: string; to: string; base: string; ringingTimeoutSecs: number }
export function maskNumber(n: string) { return n.length > 6 ? `${n.slice(0, 3)} ${"•".repeat(Math.max(2, n.length - 6))} ${n.slice(-3)}` : "•••" }
export function telephonyStatus(env: NodeJS.ProcessEnv = process.env) {
  const need: [string, string | undefined][] = [
    ["ELEVENLABS_API_KEY", env.ELEVENLABS_API_KEY?.trim()], ["ELEVENLABS_AGENT_ID", env.ELEVENLABS_AGENT_ID?.trim()],
    ["ELEVENLABS_PHONE_NUMBER_ID", env.ELEVENLABS_PHONE_NUMBER_ID?.trim()], ["DRIVER_TEST_PHONE", env.DRIVER_TEST_PHONE?.trim()],
  ]
  const missing = need.filter(([, v]) => !v).map(([k]) => k)
  const phone = env.DRIVER_TEST_PHONE?.trim() ?? ""
  if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) missing.push("DRIVER_TEST_PHONE (must be E.164, e.g. +4915112345678)")
  const enabled = env.TELEPHONY_LIVE_ENABLED === "true"
  if (!enabled) missing.push("TELEPHONY_LIVE_ENABLED=true (explicit authorization to place chargeable calls)")
  const live = missing.length === 0
  return {
    mode: live ? ("live" as const) : ("test" as const), liveReady: live, missing,
    toMasked: phone && /^\+[1-9]\d{7,14}$/.test(phone) ? maskNumber(phone) : null,
    config: live ? ({ apiKey: need[0][1]!, agentId: need[1][1]!, phoneNumberId: need[2][1]!, to: phone, base: (env.ELEVENLABS_API_BASE ?? "https://api.elevenlabs.io").replace(/\/$/, ""), ringingTimeoutSecs: 45 } as TelephonyConfig) : null,
  }
}
