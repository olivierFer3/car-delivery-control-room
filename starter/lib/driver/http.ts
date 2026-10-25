import { NextResponse } from "next/server"
import { WorkflowError } from "@/lib/incidents/engine"
import { driverAuthorized } from "./access"

export const deny = (request: Request) => driverAuthorized(request) ? null : NextResponse.json({ error: "This Driver Support link is missing or wrong. Open the link shown in the Control Room." }, { status: 401 })
export function fail(e: unknown) {
  if (e instanceof WorkflowError) return NextResponse.json({ error: e.message }, { status: 409 })
  if (e instanceof SyntaxError) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  return NextResponse.json({ error: "Support is temporarily unavailable. Try again in a moment." }, { status: 503 })
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text()
  if (raw.length > 8000) throw new SyntaxError("too large")
  const v = JSON.parse(raw || "{}")
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new SyntaxError("bad body")
  return v
}
