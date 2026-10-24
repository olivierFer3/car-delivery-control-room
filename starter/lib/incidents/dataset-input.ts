import type { CatalogProblem, SourceRef } from "./dataset-contracts"
/** Intentionally excludes test.expected, solution, judge feedback and prior approvals. */
export function investigationInput(problem: CatalogProblem, sources: { ref: SourceRef; record: unknown | null }[], alternativeNote?: string) {
  return { id: problem.id, summary: `${problem.summary ?? "No intake summary supplied"}${alternativeNote ? `\nOperator requested a new alternative: ${alternativeNote}. This is a request for investigation, not approval to act.` : ""}`, timeline: problem.timeline, test: problem.test ? { given: problem.test.given, simulated: problem.test.simulated } : {
    given: { now: problem.source.snapshot_at, order: { reference: problem.order?.reference ?? "Unlinked case", vehicle: problem.order?.vehicle ?? null, from: null, to: null, customer: null, driver: null, pickup_local: null, delivery_local: null }, facts: sources.filter(s => s.record).map(s => ({ fact: JSON.stringify(s.record), source: `${s.ref.table}:${s.ref.id} (attributed snapshot record, not independently verified)` })) },
    simulated: { driver: problem.timeline.filter(m => m.from_type === "driver").map(m => `${m.at}: ${m.text}`).join("\n") || null, site: problem.timeline.filter(m => ["site_contact", "handoff_contact"].includes(m.from_type ?? "")).map(m => `${m.at}: ${m.text}`).join("\n") || null },
  } }
}
