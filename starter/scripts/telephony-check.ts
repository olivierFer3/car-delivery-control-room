/** Read-only readiness check for real phone calls. Places NO call, changes NOTHING, prints no secrets (numbers are masked).
 *  Usage: npm run telephony:check */
import "dotenv/config"
import { maskNumber, telephonyStatus, twilioAuth, cleanAgentId } from "../lib/telephony/config"

const env = process.env
const ok = (s: boolean) => (s ? "ok     " : "MISSING")
async function json(url: string, headers: Record<string, string>) {
  try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) }); let b: unknown = null; try { b = await r.json() } catch { /* not json */ } return { status: r.status, body: b as Record<string, unknown> | null } }
  catch { return { status: 0, body: null } }
}
async function main() {
  const t = telephonyStatus()
  console.log("== Settings (values never printed)")
  for (const k of ["ELEVENLABS_API_KEY", "ELEVENLABS_AGENT_ID", "DRIVER_TEST_PHONE", "TELEPHONY_LIVE_ENABLED", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_API_KEY_SID", "TWILIO_API_KEY_SECRET", "TWILIO_API_KEY", "TWILIO_PHONE_NUMBER", "ELEVENLABS_PHONE_NUMBER_ID"]) console.log(`  ${ok(!!env[k]?.trim())} ${k}`)
  const raw = env.ELEVENLABS_AGENT_ID ?? ""
  if (raw && raw !== cleanAgentId(raw)) console.log("  note: ELEVENLABS_AGENT_ID contains extra text after the id (a pasted URL?). The server uses only the part before '?', but please fix the value.")
  console.log(`  destination: ${t.toMasked ?? "not set"} (the ONLY number this server can call)`)
  console.log(`  mode: ${t.mode.toUpperCase()}${t.provider ? ` via ${t.provider}` : ""}`)
  if (t.missing.length) console.log("  still missing:\n" + t.missing.map(m => `   - ${m}`).join("\n"))

  const key = env.ELEVENLABS_API_KEY?.trim(), agent = cleanAgentId(env.ELEVENLABS_AGENT_ID)
  if (key) {
    const h = { "xi-api-key": key }
    console.log("\n== ElevenLabs (read-only)")
    const sub = await json("https://api.elevenlabs.io/v1/user/subscription", h)
    console.log(`  plan: ${sub.status === 200 ? String(sub.body?.tier) : `could not read (HTTP ${sub.status})`}`)
    if (agent) {
      const a = await json(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agent)}`, h)
      if (a.status === 200) {
        const cc = (a.body?.conversation_config ?? {}) as { agent?: { first_message?: string; prompt?: { prompt?: string } }; conversation?: { max_duration_seconds?: number } }
        console.log(`  agent: "${a.body?.name}" ${agent.slice(0, 10)}...`)
        console.log(`  max call length: ${cc.conversation?.max_duration_seconds}s ${((cc.conversation?.max_duration_seconds ?? 0) > 150) ? "(longer than the 120s cap this project recommends)" : ""}`)
        const text = `${cc.agent?.first_message ?? ""}\n${cc.agent?.prompt?.prompt ?? ""}`
        console.log(`  uses call variables ({{driver_name}} etc.): ${/\{\{driver_name\}\}/.test(cc.agent?.first_message ?? "") ? "in first message" : "NOT in the first message"}; ${/\{\{agent_question\}\}/.test(text) ? "in prompt" : "NOT in prompt"}`)
        console.log(`  prompt starts with documentation header text: ${/Use this for the ElevenLabs agent/.test(cc.agent?.prompt?.prompt ?? "") ? "YES (should be removed)" : "no"}`)
      } else console.log(`  agent: not found or not readable (HTTP ${a.status})`)
    }
    const nums = await json("https://api.elevenlabs.io/v1/convai/phone-numbers", h)
    console.log(`  phone numbers imported in ElevenLabs: ${nums.status === 200 && Array.isArray(nums.body) ? (nums.body as unknown[]).length : `unknown (HTTP ${nums.status})`}`)
  }

  const tw = twilioAuth(env)
  console.log("\n== Twilio (read-only)")
  if (!tw.auth) { console.log("  credentials incomplete:\n" + tw.missing.map(m => `   - ${m}`).join("\n")); return }
  const auth = { Authorization: `Basic ${Buffer.from(`${tw.auth.user}:${tw.auth.secret}`).toString("base64")}` }
  const base = `https://api.twilio.com/2010-04-01/Accounts/${tw.auth.accountSid}`
  const acct = await json(`${base}.json`, auth)
  if (acct.status !== 200) { console.log(`  account: not reachable (HTTP ${acct.status}). The credentials are wrong or revoked.`); return }
  console.log(`  account: ${String(acct.body?.type)} / ${String(acct.body?.status)}`)
  const own = await json(`${base}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(tw.auth.from)}`, auth)
  const list = ((own.body?.incoming_phone_numbers ?? []) as { phone_number: string; capabilities?: { voice?: boolean } }[])
  console.log(`  ${ok(list.length > 0)} caller number ${maskNumber(tw.auth.from)} is in this account${list[0] ? `, voice ${list[0].capabilities?.voice ? "enabled" : "NOT enabled"}` : ""}`)
  const verified = await json(`${base}/OutgoingCallerIds.json?PhoneNumber=${encodeURIComponent(env.DRIVER_TEST_PHONE ?? "")}`, auth)
  const isVerified = ((verified.body?.outgoing_caller_ids ?? []) as unknown[]).length > 0
  console.log(`  destination ${t.toMasked}: ${isVerified ? "verified in Twilio" : "not a verified caller ID" + (acct.body?.type === "Trial" ? " (a TRIAL account can only call verified numbers)" : "")}`)
  const price = await json(`https://pricing.twilio.com/v2/Voice/Numbers/${encodeURIComponent(env.DRIVER_TEST_PHONE ?? "")}?OriginationNumber=${encodeURIComponent(tw.auth.from)}`, auth)
  const out = price.body?.outbound_call_price as { base_price?: number | string; current_price?: number | string } | undefined
  console.log(`  outbound price per minute to this number: ${out ? `${out.current_price ?? out.base_price} ${String(price.body?.price_unit)}` : `not available (HTTP ${price.status})`}`)
  const bal = await json(`${base}/Balance.json`, auth)
  if (bal.status === 200) console.log(`  balance: ${String(bal.body?.balance)} ${String(bal.body?.currency)}`)
}
main().catch(e => { console.error("check failed:", e instanceof Error ? e.message : e); process.exit(1) })
