import { operationalOrders, toolsData } from "@/lib/incidents/store"
import { loadOrder } from "@/lib/present/load"
import { buildBoardCard } from "@/lib/present/board"

export type DriverOrder = {
  id: string; reference: string; vehicle: string; plate: string | null; route: string; driverName: string
  ferry: { reservationId: string; checkInCutoffAt: string; departureAt: string; from: string | null; to: string | null } | null
  openIncidentId: string | null
}
/** Only orders with a supported future booked ferry can be reported on: that is what the investigation agent covers. */
export async function driverOrders(): Promise<DriverOrder[]> {
  const orders = (await operationalOrders()).filter(o => o.signals.some(s => s.supported))
  const out: DriverOrder[] = []
  for (const o of orders) {
    const [loaded, context] = await Promise.all([loadOrder(o.id), toolsData.context(o.id)])
    if (!loaded || !context) continue
    const card = buildBoardCard(loaded.bundle)
    const ferry = context.reservations.find(r => r.kind === "FERRY" && r.status === "BOOKED")
    out.push({
      id: o.id, reference: o.reference, vehicle: card.vehicle, plate: card.plate, route: `${card.origin} to ${card.destination}`,
      driverName: loaded.drivers[0]?.displayName ?? "Assigned driver",
      ferry: ferry ? { reservationId: ferry.id, checkInCutoffAt: String(ferry.check_in_cutoff_at ?? ""), departureAt: String(ferry.departure_at ?? ""), from: (ferry.origin_terminal as string) ?? null, to: (ferry.destination_terminal as string) ?? null } : null,
      openIncidentId: o.incidents.find(i => i.state !== "resolved")?.id ?? null,
    })
  }
  return out
}
