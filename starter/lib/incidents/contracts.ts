/** Shared with Person A. No provider secrets or raw traces in this contract. */
export const SIMULATION_TIME = "2026-10-21T09:00:00Z"
export type IncidentState = "investigating" | "waiting" | "needs_decision" | "approved" | "resolved" | "technical_error"
export type Scenario = "delay" | "disproved" | "no_response" | "contradiction"
export type Evidence = { id: string; source: string; at: string; text: string; kind: "record" | "reported" | "assumption" }
export type Action = { kind: "change_booking"; reservationId: string; optionId: string; costCents: number; currency: string; departureAt: string; arrivalAt: string }
export type Proposal = { version: number; summary: string; consequences: string; evidenceIds: string[]; actions: Action[] }
export type Decision = { version: number; choice: "approve" | "reject" | "alternative"; operator: string; comment: string; at: string }
export type Execution = { version: number; status: "succeeded" | "failed"; at: string; effects: Action[]; reason: string }
export type Incident = {
  /** Explicitly isolated fictional demo replay; normal incidents omit this. */
  demoRunId?: string
  id: string; orderId: string; signalId: string; scenario: Scenario; simulationTime: string; state: IncidentState
  summary: string; evidence: Evidence[]; missing: string[]; contradictions: string[]; nextStep: string
  tasks: { tool: string; args: Record<string, unknown>; result: unknown; at: string }[]
  proposals: Proposal[]; decisions: Decision[]; executions: Execution[]
  conversation: { role: "operator" | "agent"; text: string; at: string }[]
  timeline: { type: string; text: string; at: string }[]
  technical: { provider: string; model: string; error?: string }[]
}
export type Command =
  | { command: "run" }
  | { command: "mock_proposal" }
  | { command: "decide"; version: number; choice: Decision["choice"]; operator: string; comment: string }
  | { command: "execute"; version: number }
  | { command: "message"; text: string }
export type ToolCall = { tool: string; args: Record<string, unknown> }
export interface Provider { name: string; model: string; choose(incident: Incident, signal: AbortSignal): Promise<ToolCall> }

export type PublicIncident = Omit<Incident, "technical">
