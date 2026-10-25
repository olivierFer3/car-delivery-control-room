import { NextResponse } from "next/server"
import { body, deny, fail } from "@/lib/driver/http"
import { submitDriverReply } from "@/lib/driver/flow"
export const runtime = "nodejs"
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const no = deny(request); if (no) return no
  try { const b = await body(request); await submitDriverReply((await context.params).id, b as never); return NextResponse.json({ ok: true }) } catch (e) { return fail(e) }
}
