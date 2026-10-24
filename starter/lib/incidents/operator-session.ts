import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"
const LIFETIME = 8 * 60 * 60 * 1000
export const OPERATOR_COOKIE = "control-room-operator"
function signature(value: string, secret: string) { return createHmac("sha256", secret).update(value).digest("hex") }
export function tokenMatches(received: unknown, secret: string | undefined): boolean {
  if (!secret || typeof received !== "string") return false
  const a = Buffer.from(received), b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}
export function issueSession(secret: string, now = Date.now()) {
  const value = `${now + LIFETIME}.${randomBytes(24).toString("hex")}`
  return `${value}.${signature(value, secret)}`
}
export function validSession(session: string | undefined, secret: string | undefined, now = Date.now()): boolean {
  if (!session || !secret) return false
  const parts = session.split(".")
  if (parts.length !== 3 || !/^\d+$/.test(parts[0]) || !/^[a-f0-9]{48}$/.test(parts[1])) return false
  const expiry = Number(parts[0])
  return expiry > now && expiry <= now + LIFETIME && tokenMatches(parts[2], signature(`${parts[0]}.${parts[1]}`, secret))
}
