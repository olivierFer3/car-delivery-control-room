import { NextResponse } from "next/server"
import { deny, fail } from "@/lib/driver/http"
import { driverView, mutateWithRetry } from "@/lib/driver/flow"
import { syncThread } from "@/lib/incidents/activity"
import { getIncident } from "@/lib/incidents/store"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const no = deny(request); if (no) return no
  try {
    const id = (await context.params).id
    let i = await getIncident(id)
    if (!i?.driverReport) return NextResponse.json({ error: "Incident not found" }, { status: 404 })
    const before = i.driverMessages?.length ?? 0
    const probe = structuredClone(i); syncThread(probe) // new agent/operator lines are persisted once so their time is stable
    if ((probe.driverMessages?.length ?? 0) !== before) { try { await mutateWithRetry(id, inc => { syncThread(inc) }, 2); i = (await getIncident(id)) ?? i } catch { i = probe } }
    return NextResponse.json(driverView(i))
  } catch (e) { return fail(e) }
}
