/** Shared with Person A. No provider secrets or raw traces in this contract. */
export const SIMULATION_TIME = "2026-10-21T09:00:00Z"
export type IncidentState = "investigating" | "waiting" | "needs_decision" | "approved" | "resolved" | "technical_error"
export type Scenario = "delay" | "disproved" | "no_response" | "contradiction"
export type Evidence = { id: string; source: string; at: string; text: string; kind: "record" | "reported" | "assumption" }
export type Action = { kind: "change_booking"; reservationId: string; optionId: string; costCents: number; currency: string; departureAt: string; arrivalAt: string }
export type Proposal = { version: number; summary: string; consequences: string; evidenceIds: string[]; actions: Action[] }
export type Decision = { version: number; choice: "approve" | "reject" | "alternative"; operator: string; comment: string; at: string }
export type Execution = { version: number; status: "succeeded" | "failed"; at: string; effects: Action[]; reason: string }
export type DriverReply = { id: string; terminalEta: string; safe: boolean; blockers: string[]; text: string; at: string }
export type ModelTurn = { id: string; provider: string; model: string; responseId?: string; actualModel?: string; endpoint?: string; purpose: "investigate" | "explain"; at: string; selected?: ToolCall; result?: unknown; error?: string }
/** A report typed or spoken by the (synthetic) driver on the Driver Support page. Untrusted text. */
export type DriverReport = { text: string; reportedAt: string; driverName: string; vehicle: string; reference: string; channel: "driver_app" }
/** One line of the driver conversation. `at` is real wall-clock time; everything else in an incident is simulated time. */
export type DriverMessage = { id: string; role: "driver" | "agent" | "operator" | "system"; text: string; at: string; via: "text" | "voice" | "system"; callId?: string }
/** A phone conversation about one incident. `live` means a real call through the telephone network; `test` never leaves this server. */
export type CallSession = {
  id: string; mode: "live" | "test"; provider: "elevenlabs-twilio" | "twilio-direct" | "test-mode"
  status: "requested" | "ringing" | "in_progress" | "processing" | "completed" | "failed"
  toMasked: string; requestedAt: string; startedAt?: string; endedAt?: string
  conversationId?: string; callSid?: string; failure?: string
  /** Twilio's own view of the call (direct mode): queued, ringing, in-progress, completed, busy, no-answer, failed. */
  twilioStatus?: string; durationSecs?: number; price?: string
  transcript: { role: "agent" | "driver"; text: string; t?: number }[]
  extracted?: { minutesToTerminal: number | null; safe: boolean | null; blockers: string[]; summary: string; applied: boolean; note: string }
}
export type Incident = {
  driverReport?: DriverReport
  driverMessages?: DriverMessage[]
  /** Set while the server retries a run that stopped for a temporary reason (model rate limit, time limit). */
  agentRetry?: { attempt: number; reason: string }
  calls?: CallSession[]
  /** Operational cases retain the selected source, separate from legacy demo replays. */
  workflow?: "ferry_delay" | "human_review"
  mode?: "llm" | "mock"
  preferredProvider?: "groq" | "gemini"
  driverReplies?: DriverReply[]
  activeRun?: { id: string; expiresAt: string }
  modelTurns?: ModelTurn[]
  stopReason?: string
  lastAgentError?: string
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
  | { command: "receive_driver_reply"; terminalEta: string; safe: boolean; blockers: string[]; text: string }
export type ToolCall = { tool: string; args: Record<string, unknown>; metadata?: { responseId?: string; actualModel?: string; endpoint?: string } }
export interface Provider { name: string; model: string; choose(incident: Incident, signal: AbortSignal, purpose?: "investigate" | "explain"): Promise<ToolCall> }

export type PublicIncident = Omit<Incident, "technical">
