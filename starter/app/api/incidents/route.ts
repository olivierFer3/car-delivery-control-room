import { NextResponse } from "next/server"
import { createIncident, WorkflowError } from "@/lib/incidents/engine"
import { insertIncident, listIncidents, toolsData } from "@/lib/incidents/store"
import { authorize, publicIncident, readBody } from "@/lib/incidents/http"
import { createLiveIncident, createOperationalIncident } from "@/lib/incidents/service"
import type { Scenario } from "@/lib/incidents/contracts"
export const runtime = "nodejs"
export async function GET(request: Request) {
  try { return NextResponse.json({ incidents: (await listIncidents(new URL(request.url).searchParams.get("q") ?? "")).map(publicIncident), uncheckedOrders: "Not checked" }) }
  catch { return NextResponse.json({ error: "Incident storage unavailable; run incidents:init" }, { status: 503 }) }
}
export async function POST(request: Request) {
  if (!authorize(request)) return NextResponse.json({ error: "Operator token required" }, { status: 401 })
  try {
    const b = await readBody(request)
    if (b.workflow === "operational" || (b.mode === "llm" && typeof b.orderId === "string")) return NextResponse.json(publicIncident(await createOperationalIncident(b.orderId,b.signalId,b.provider)),{status:201})
    if (b.mode === "llm") {
      const incident = await createLiveIncident(b.scenario,b.provider)
      return NextResponse.json(publicIncident(incident),{status:201})
    }
    if (typeof b.orderId !== "string" || typeof b.signalId !== "string" || !["delay", "disproved", "no_response", "contradiction"].includes(b.scenario)) throw new WorkflowError("Invalid order, signal or scenario")
    const c = await toolsData.context(b.orderId)
    if (!c || !c.alerts.some(a => a.id === b.signalId)) throw new WorkflowError("Signal must belong to order")
    const i = createIncident(b.orderId, b.signalId, b.scenario as Scenario)
    await insertIncident(i)
    return NextResponse.json(publicIncident(i), { status: 201 })
  } catch (e) { return NextResponse.json({ error: e instanceof WorkflowError ? e.message : "Unable to create incident" }, { status: e instanceof WorkflowError || e instanceof SyntaxError ? 400 : 503 }) }
}
