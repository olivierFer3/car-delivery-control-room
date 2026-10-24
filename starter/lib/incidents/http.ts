import { timingSafeEqual } from "node:crypto"
import type { Incident } from "./contracts"
export function authorize(request: Request) {
  const token = process.env.INCIDENT_OPERATOR_TOKEN
  const received = request.headers.get("authorization") ?? ""
  const expected = `Bearer ${token}`
  const actualBytes = Buffer.from(received), expectedBytes = Buffer.from(expected)
  return !!token && actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}
export function publicIncident(i: Incident) { const { technical: _technical, ...view } = i; return view }
export async function readBody(request: Request) {
  const raw = await request.text()
  if (raw.length > 16000) throw new Error("Request too large")
  const value = JSON.parse(raw)
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid request")
  return value
}
