import { NextResponse } from "next/server"
import { deny } from "@/lib/driver/http"
import { configuredProviders } from "@/lib/incidents/providers"
import { telephonyStatus } from "@/lib/telephony/config"
import { SIMULATION_TIME } from "@/lib/incidents/contracts"
export const runtime = "nodejs"
export async function GET(request: Request) {
  const no = deny(request); if (no) return no
  const t = telephonyStatus(), agent = configuredProviders("groq", false)[0] ?? configuredProviders("gemini", false)[0]
  return NextResponse.json({ simulationTime: SIMULATION_TIME, agent: agent ? { provider: agent.name, model: agent.model } : null, phone: { mode: t.mode, toMasked: t.toMasked, missing: t.missing } })
}
