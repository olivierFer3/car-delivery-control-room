export const DATASETS = { bahn: "Bahn snapshot", hand: "Hand-written tests", generated: "Generated tests", synthetic: "Synthetic variants" } as const
export type DatasetKey = keyof typeof DATASETS
export type SourceRef = { table: string; id: string }
export type Problem = {
  id: string; schema_version: string
  source: { origin: string; snapshot_at: string | null; records: SourceRef[]; grouping: { from: string; to: string; basis: string }[] }
  order: { id: string; reference: string; status: string; route_kind: string; vehicle: string | null } | null
  related_order_ids: string[]; problem_type: string; domain: string; phase: string; severity: string | null
  status: "open" | "resolved" | "scenario"; opened_at: string | null; resolved_at: string | null; summary: string | null
  owners: string[]; waiting_on: string[]; next_actions: { text: string; source: SourceRef }[]
  agent_work: { proposal_id: string; agent_id: string | null; command: string; summary: string | null; rationale: string | null; status: string; proposed_payload: Record<string, unknown> | null }[]
  human_decisions: { proposal_id: string; decision: string; note: string | null; by: string | null; at: string | null; final_payload: Record<string, unknown> | null }[]
  resolution: { text: string; at: string | null; source: SourceRef }[]
  timeline: { message_id: string | null; at: string | null; from_type: string | null; from_id: string | null; to_type: string | null; to_id: string | null; channel: string | null; visibility: string | null; language: string | null; text: string | null }[]
  evidence_refs: SourceRef[]; solution: { status: "applied" | "planned" | "expected" | "none"; text: string | null; sources: SourceRef[] }
  test?: { given: { now: string | null; order: Record<string, string | null>; facts: { fact: string; source: string }[] }; simulated: { driver: string | null; site: string | null }; expected: { handoff: string; must: string[]; must_not: string[] } }
}
export type CatalogProblem = Problem & { dataset: DatasetKey }
export type ProblemCard = Pick<CatalogProblem, "id" | "dataset" | "order" | "problem_type" | "domain" | "phase" | "severity" | "status" | "summary" | "owners" | "waiting_on" | "opened_at"> & { solutionStatus: Problem["solution"]["status"]; nextStep: string | null; decisionCount: number }
export type CatalogResponse = { investigations?: (DatasetRun & { dataset: DatasetKey; reference: string | null })[]; items: ProblemCard[]; total: number; page: number; pages: number; counts: Record<DatasetKey, number>; facets: { domains: string[]; types: string[] }; statusCounts: Record<string, number> }
export type AgentTrace = { case_id?: string; model?: string; steps: { step: number; tool: string | null; args?: Record<string, unknown>; result?: unknown; text?: string; seconds?: number }[]; finish: { handoff?: string; headline?: string; summary?: string; recommendation?: string; facts?: { fact: string; source: string }[]; needs_approval?: string[]; actions?: string[] } | null; violations: { tool: string; args: unknown }[]; error: string | null; timing?: { seconds: number; llm_calls?: number; tool_calls?: number } }
export type DatasetRun = { id: string; problemId: string; state: "running" | "finished" | "technical_error"; startedAt: string; finishedAt?: string; trace?: AgentTrace; error?: string; decisions: { choice: "approve" | "reject" | "alternative"; comment: string; at: string; operator: string }[] }
export type DatasetDetail = { agentConfigured: boolean; problem: CatalogProblem; sources: { ref: SourceRef; record: unknown | null }[]; evaluations: { report: string; trace: AgentTrace; score: unknown }[]; runs: DatasetRun[]; runStorageError?: string }
export function humanLabel(value: string) { return value.replace(/_/g, " ").toLowerCase().replace(/^./, c => c.toUpperCase()) }
