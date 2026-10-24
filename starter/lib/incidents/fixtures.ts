import type { RecordRow } from "./engine"
/** Authored fictional service responses, NOT additional facts from Bahn's snapshot. */
export function simulatedTravelOptions(orderId: string): RecordRow[] {
  if (orderId !== "ord-00603") return []
  return [1, 2].map(n => ({ id: `sim-ferry-603-${n}`, order_id: orderId, assignment_id: "asg-x3bfd2d7c41a7a3d5", kind: "FERRY", status: "AVAILABLE_QUOTE", provider: "Fictional Demo Ferry Service", data_origin: "SIMULATED_SERVICE", checked_at: "2026-10-21T09:00:00Z", check_in_cutoff_at: `2026-10-${21+n}T12:00:00Z`, departure_at: `2026-10-${21+n}T14:00:00Z`, arrival_at: `2026-10-${22+n}T20:00:00Z`, quote_cents: n === 1 ? 38700 : 25600, currency: "EUR", capacity_note: "Fictional vehicle slot quote; unbooked. No real service contacted." }))
}
