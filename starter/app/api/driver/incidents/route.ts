import { NextResponse } from "next/server"
import { underHourlyLimit } from "@/lib/driver/access"
import { body, deny, fail } from "@/lib/driver/http"
import { createDriverIncident } from "@/lib/driver/flow"
export const runtime = "nodejs"
export async function POST(request: Request) {
  const no = deny(request); if (no) return no
  try {
    if (!underHourlyLimit()) return NextResponse.json({ error: "Too many incidents were reported in the last hour on this demo. Try again later." }, { status: 429 })
    const b = await body(request)
    const i = await createDriverIncident({ orderId: b.orderId, text: b.text })
    return NextResponse.json({ id: i.id }, { status: 201 })
  } catch (e) { return fail(e) }
}
export const dynamic = "force-dynamic"
