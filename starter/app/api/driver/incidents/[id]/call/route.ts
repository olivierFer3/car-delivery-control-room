import { NextResponse } from "next/server"
import { deny, fail } from "@/lib/driver/http"
import { requestCall } from "@/lib/driver/flow"
export const runtime = "nodejs"
export const maxDuration = 60
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const no = deny(request); if (no) return no
  try { return NextResponse.json({ callId: await requestCall((await context.params).id) }, { status: 201 }) } catch (e) { return fail(e) }
}
