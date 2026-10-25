/** Aligns the ElevenLabs voice agent with docs/telephony/AGENT-PROMPT.md: call-variable first message, clean system prompt, 120 s cap.
 *  Default is a DRY RUN that only reads. `--apply` sends one PATCH to the agent's settings (no call is made, nothing is billed).
 *  Usage: npm run telephony:agent            (dry run)
 *         npm run telephony:agent -- --apply  */
import "dotenv/config"
import { readFileSync } from "node:fs"
import { cleanAgentId } from "../lib/telephony/config.ts"

const apply = process.argv.includes("--apply")
const key = process.env.ELEVENLABS_API_KEY?.trim(), agent = cleanAgentId(process.env.ELEVENLABS_AGENT_ID)
if (!key || !agent) { console.error("ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID are required."); process.exit(1) }
const doc = readFileSync(new URL("../../docs/telephony/AGENT-PROMPT.md", import.meta.url), "utf8")
const first = /First message: `([^`]+)`/.exec(doc)?.[1], prompt = doc.split("System prompt:")[1]?.trim()
if (!first || !prompt) { console.error("Could not read the first message and system prompt from AGENT-PROMPT.md"); process.exit(1) }
const url = `https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agent)}`
const headers = { "xi-api-key": key, "Content-Type": "application/json" }
type Agent = { name?: string; conversation_config?: { agent?: { first_message?: string; prompt?: { prompt?: string; llm?: string } }; conversation?: { max_duration_seconds?: number }; tts?: { voice_id?: string } } }
const read = async () => (await (await fetch(url, { headers, signal: AbortSignal.timeout(20_000) })).json()) as Agent
const before = await read()
const cc = before.conversation_config
console.log(`Agent "${before.name}" (${agent.slice(0, 10)}...)`)
console.log(`  max call length : ${cc?.conversation?.max_duration_seconds}s  ->  120s`)
console.log(`  first message   : "${cc?.agent?.first_message}"\n               ->  "${first}"`)
console.log(`  system prompt   : ${cc?.agent?.prompt?.prompt?.length} chars (starts "${cc?.agent?.prompt?.prompt?.slice(0, 40).replace(/\n/g, " ")}...")  ->  ${prompt.length} chars (starts "${prompt.slice(0, 40).replace(/\n/g, " ")}...")`)
console.log(`  unchanged       : language model "${cc?.agent?.prompt?.llm}", voice ${String(cc?.tts?.voice_id).slice(0, 6)}...`)
if (!apply) { console.log("\nDry run only. Nothing was changed. Re-run with --apply to send this one settings update."); process.exit(0) }
const r = await fetch(url, { method: "PATCH", headers, signal: AbortSignal.timeout(20_000), body: JSON.stringify({ conversation_config: { agent: { first_message: first, prompt: { prompt } }, conversation: { max_duration_seconds: 120 } } }) })
console.log(`\nPATCH -> HTTP ${r.status}`)
if (!r.ok) process.exit(1)
const after = (await read()).conversation_config
console.log(`verified: max ${after?.conversation?.max_duration_seconds}s, first message set: ${after?.agent?.first_message === first}, prompt set: ${after?.agent?.prompt?.prompt === prompt}, language model still "${after?.agent?.prompt?.llm}", voice ${String(after?.tts?.voice_id).slice(0, 6)}...`)
