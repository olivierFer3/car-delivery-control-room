import type { RecordRow } from "./engine"
/** Authored fictional service responses, NOT additional facts from Bahn's snapshot. */
export function simulatedTravelOptions(orderId: string, reservations: RecordRow[] = []): RecordRow[] {
  if (orderId !== "ord-00603") {
    const booked=reservations.filter(r=>r.kind==='FERRY'&&r.status==='BOOKED'&&typeof r.check_in_cutoff_at==='string'&&Date.parse(r.check_in_cutoff_at)>Date.parse('2026-10-21T09:00:00Z'))
    if(booked.length!==1)return []
    const r=booked[0],cutoff=Date.parse(String(r.check_in_cutoff_at))
    return [1,2].map(n=>({id:`sim-ferry-${orderId}-${n}`,order_id:orderId,assignment_id:r.assignment_id,kind:'FERRY',status:'AVAILABLE_QUOTE',provider:'Fictional Ferry Service',data_origin:'SIMULATED_SERVICE',checked_at:'2026-10-21T09:00:00Z',check_in_cutoff_at:new Date(cutoff+n*86400000).toISOString(),departure_at:new Date(cutoff+n*86400000+7200000).toISOString(),arrival_at:new Date(cutoff+(n+1)*86400000+7200000).toISOString(),quote_cents:n===1?38700:25600,currency:'EUR',origin_terminal:r.origin_terminal,destination_terminal:r.destination_terminal,capacity_note:'Fictional unbooked quote, generated for this order/assignment. No real availability asserted.'}))
  }
  return [1, 2].map(n => ({ id: `sim-ferry-603-${n}`, order_id: orderId, assignment_id: "asg-x3bfd2d7c41a7a3d5", kind: "FERRY", status: "AVAILABLE_QUOTE", provider: "Fictional Demo Ferry Service", data_origin: "SIMULATED_SERVICE", checked_at: "2026-10-21T09:00:00Z", check_in_cutoff_at: `2026-10-${21+n}T12:00:00Z`, departure_at: `2026-10-${21+n}T14:00:00Z`, arrival_at: `2026-10-${22+n}T20:00:00Z`, quote_cents: n === 1 ? 38700 : 25600, currency: "EUR", capacity_note: "Fictional vehicle slot quote; unbooked. No real service contacted." }))
}
