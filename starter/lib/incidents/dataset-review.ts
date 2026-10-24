import type { AgentTrace, DatasetRun } from "./dataset-contracts"
import { WorkflowError } from "./engine"
/** A model result is not trusted as a valid UI or approval payload. */
export function parseAgentTrace(value: unknown): AgentTrace {
  const r = value as AgentTrace | null
  const fail = () => { throw new WorkflowError("Invalid agent result; no action was applied") }
  if (!r || !Array.isArray(r.steps) || !Array.isArray(r.violations) || (r.error != null && typeof r.error !== "string")) return fail()
  if (r.steps.some(s => !s || (s.tool != null && typeof s.tool !== "string"))) return fail()
  if (r.violations.some(v => !v || typeof v.tool !== "string")) return fail()
  if (r.finish) {
    if (!["agent_alone", "person_decides", "person_only"].includes(r.finish.handoff ?? "")) return fail()
    for (const field of ["headline", "summary", "recommendation"] as const) if (r.finish[field] != null && typeof r.finish[field] !== "string") return fail()
    for (const field of ["needs_approval", "actions"] as const) if (r.finish[field] != null && (!Array.isArray(r.finish[field]) || r.finish[field]!.some(s => typeof s !== "string"))) return fail()
    if (r.finish.facts != null && (!Array.isArray(r.finish.facts) || r.finish.facts.some(f => !f || typeof f.fact !== "string" || typeof f.source !== "string"))) return fail()
  }
  return r
}
export function applyDatasetReview(run: DatasetRun, choice: string, comment: string) {
  if (!["approve", "reject", "alternative"].includes(choice) || typeof comment !== "string" || comment.length > 4000) throw new WorkflowError("Invalid review")
  if (run.state !== "finished" || !["person_decides", "person_only"].includes(run.trace?.finish?.handoff ?? "") || run.trace?.violations.length) throw new WorkflowError("No reviewable recommendation")
  if (run.decisions.length) throw new WorkflowError("This recommendation already has a decision. A new investigation requires a new review.")
  run.decisions.push({ choice: choice as "approve" | "reject" | "alternative", comment, at: new Date().toISOString(), operator: "demo-operator" })
  return run
}
