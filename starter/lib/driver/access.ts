import { createHmac, timingSafeEqual } from "node:crypto"

/** The Driver Support page is for synthetic demo drivers. It is reached with a code derived from the operator token,
 *  so a shared link works without ever exposing the token itself. */
export function driverCode(): string | null {
  const secret = process.env.INCIDENT_OPERATOR_TOKEN
  return secret ? createHmac("sha256", secret).update("driver-support-demo").digest("hex").slice(0, 16) : null
}
export function driverAuthorized(request: Request): boolean {
  const code = driverCode()
  if (!code) return false
  const got = request.headers.get("x-driver-code") ?? new URL(request.url).searchParams.get("k") ?? ""
  const a = Buffer.from(got), b = Buffer.from(code)
  return a.length === b.length && timingSafeEqual(a, b)
}
const hits: number[] = []
/** At most `limit` creations per hour on this server, whatever the caller. */
export function underHourlyLimit(limit = 12, now = Date.now()): boolean {
  while (hits.length && hits[0] < now - 3_600_000) hits.shift()
  if (hits.length >= limit) return false
  hits.push(now); return true
}
