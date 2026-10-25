import { NextResponse } from "next/server"
import { body, deny, fail } from "@/lib/driver/http"
import { endTestCall, testCallTurn } from "@/lib/driver/flow"
export const runtime = "nodejs"
export const maxDuration = 60
/** Test mode only. action "say" adds a typed line, action "end" finishes the simulated call. Live calls are controlled by the phone. */
export async function POST(request: Request, context: { params: Promise<{ id: string; callId: string }> }) {
  const no = deny(request); if (no) return no
  try {
    const { id, callId } = await context.params, b = await body(request)
    if (b.action === "say") await testCallTurn(id, callId, b.text)
    else if (b.action === "end") await endTestCall(id, callId)
    else return NextResponse.json({ error: "Unknown action" }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) { return fail(e) }
}
