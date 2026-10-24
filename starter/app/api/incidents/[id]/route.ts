import { NextResponse } from "next/server"
import { decide, executeApproved, runAgent, WorkflowError } from "@/lib/incidents/engine"
import { configuredProviders } from "@/lib/incidents/providers"
import { mockProposal } from "@/lib/incidents/mock"
import { getIncident, mutateIncident, toolsData } from "@/lib/incidents/store"
import { authorize, publicIncident, readBody } from "@/lib/incidents/http"
import type { Command } from "@/lib/incidents/contracts"
export const runtime = "nodejs"
export const maxDuration = 120
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const i = await getIncident((await context.params).id)
    if (!i) return NextResponse.json({ error: "Incident not found" }, { status: 404 })
    const technical = new URL(request.url).searchParams.get("technical") === "1" && authorize(request)
    return NextResponse.json(technical ? i : publicIncident(i))
  } catch { return NextResponse.json({ error: "Incident storage unavailable" }, { status: 503 }) }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!authorize(request)) return NextResponse.json({ error: "Operator token required" }, { status: 401 })
  try {
    const b = await readBody(request) as Command
    const i = await mutateIncident((await context.params).id, async i => {
      switch (b.command) {
        case "run": await runAgent(i, toolsData, configuredProviders()); break
        case "mock_proposal": await mockProposal(i, toolsData); break
        case "decide": decide(i, b); break
        case "execute": executeApproved(i, b.version); break
        case "message":
          if (typeof b.text !== "string" || !b.text.trim() || b.text.length > 4000) throw new WorkflowError("Invalid message")
          i.conversation.push({ role: "operator", text: b.text, at: i.simulationTime })
          await runAgent(i, toolsData, configuredProviders())
          i.conversation.push({ role: "agent", text: `${i.summary}. ${i.nextStep}`, at: i.simulationTime }); break
        default: throw new WorkflowError("Unknown command")
      }
    })
    return NextResponse.json(publicIncident(i))
  } catch (e) { return NextResponse.json({ error: e instanceof WorkflowError ? e.message : "Incident command failed" }, { status: e instanceof WorkflowError ? 409 : e instanceof SyntaxError ? 400 : 503 }) }
}
