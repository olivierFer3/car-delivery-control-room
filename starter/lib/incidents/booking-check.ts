import type { Incident, DriverReply } from "./contracts"
import type { Context } from "./engine"
export function latestDriver(i: Incident): DriverReply | undefined {
  if (i.driverReplies?.length) return i.driverReplies.at(-1)
  const task = i.tasks.findLast(t => t.tool === "ask_driver")
  const r = task?.result as Partial<DriverReply> & { status?: string } | undefined
  if (r?.terminalEta) return { id: `driver:${i.id}`, terminalEta: r.terminalEta, safe: r.safe === true, blockers: r.blockers ?? [], text: r.text ?? "Simulated report", at: i.simulationTime }
}
export function bookingConstraints(i: Incident, c: Context, reservationId: string) {
  const r = c.reservations.find(r => r.id === reservationId && r.kind === "FERRY" && r.status === "BOOKED")
  const driver = latestDriver(i)
  const eta = driver ? Date.parse(driver.terminalEta) : NaN
  const cutoff = typeof r?.check_in_cutoff_at === "string" ? Date.parse(r.check_in_cutoff_at) : NaN
  const valid = !!r && Number.isFinite(eta) && Number.isFinite(cutoff) && eta >= Date.parse(i.simulationTime) && cutoff >= Date.parse(i.simulationTime)
  const otherAlerts = c.alerts.filter(a => a.id !== i.signalId && ["OPEN", "ACKNOWLEDGED"].includes(String(a.status)))
  const blockers = [...(driver?.blockers ?? []), ...i.contradictions, ...otherAlerts.map(a => `Other open alert: ${a.id}`)]
  return { reservationId, terminalEta: driver?.terminalEta ?? null, checkInCutoff: r?.check_in_cutoff_at ?? null, driverEvidenceId: driver?.id ?? null, missesCutoff: valid ? eta > cutoff : null, canRetain: valid && eta <= cutoff && driver?.safe === true && blockers.length === 0, blockers, missing: !driver ? ["Current driver reply"] : !valid ? ["Valid current ETA and booking cutoff"] : driver.safe !== true ? ["Driver safety confirmation"] : [], sourceRefs: [reservationId, ...(driver ? [driver.id] : [])], limitation: "Deterministic planning check using a simulated driver report; no gate scan or boarding confirmation is asserted." }
}
