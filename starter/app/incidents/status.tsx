import type { PublicIncident } from "@/lib/incidents/contracts"
import styles from "./incidents.module.css"

type Tone = "decision" | "ready" | "active" | "waiting" | "technical" | "human" | "done" | "unchecked"

// Each status has a word and a glyph, so it reads without colour.
const INCIDENT: Record<PublicIncident["state"], { label: string; glyph: string; tone: Tone }> = {
  needs_decision: { label: "Needs your decision", glyph: "◆", tone: "decision" },
  approved: { label: "Approved · apply separately", glyph: "✓", tone: "ready" },
  investigating: { label: "Investigating", glyph: "◔", tone: "active" },
  waiting: { label: "Waiting for information", glyph: "⏸", tone: "waiting" },
  technical_error: { label: "Technical review", glyph: "!", tone: "technical" },
  resolved: { label: "Incident resolved", glyph: "✓", tone: "done" },
}

export function incidentStatus(incident: Pick<PublicIncident, "state" | "workflow">) {
  if (incident.workflow === "human_review") return { label: "Human handling", glyph: "→", tone: "human" as Tone }
  return INCIDENT[incident.state]
}

const CHECK: Record<string, { glyph: string; tone: Tone }> = {
  "Not checked": { glyph: "○", tone: "unchecked" },
  "Technical review required": { glyph: "!", tone: "technical" },
  "Human review required": { glyph: "→", tone: "human" },
  "Investigation / decision pending": { glyph: "◔", tone: "active" },
  "Checked · no action needed": { glyph: "✓", tone: "done" },
  "Checked · incident resolved; delivery separate": { glyph: "✓", tone: "done" },
}

export function checkStatus(text: string) {
  return { label: text, ...(CHECK[text] ?? { glyph: "•", tone: "unchecked" as Tone }) }
}

export function StatusBadge({ status }: { status: { label: string; glyph: string; tone: Tone } }) {
  return <span className={styles.status} data-tone={status.tone}><span aria-hidden="true">{status.glyph}</span> {status.label}</span>
}

/** An LLM investigation with no run in progress: the agent waits for someone to resume it. */
export function paused(incident: { state: string; mode?: string; activeRun?: unknown }) {
  return incident.mode === "llm" && incident.state === "investigating" && !incident.activeRun
}

/** Who acts next, in plain words, from the incident state. */
export function responsible(incident: Pick<PublicIncident, "state" | "workflow"> & { mode?: PublicIncident["mode"]; activeRun?: unknown }) {
  if (incident.workflow === "human_review") return "An operator handles this case manually"
  if (paused(incident)) return "You: resume the investigation (the agent is paused, nothing is running)"
  return {
    needs_decision: "You: approve, reject or ask for an alternative",
    approved: "You: apply the approved change, as a separate step",
    investigating: "The agent: running its checks",
    waiting: "Missing information: a driver reply or a fresh option is needed before the case continues",
    technical_error: "An operator: check the technical problem, then resume",
    resolved: "No one: the incident is closed (delivery is tracked separately)",
  }[incident.state]
}

/** What the agent decided, in plain words: its own solution, or a handoff to a person. */
export function agentDecision(i: PublicIncident): { kind: "agent" | "person" | "pending"; text: string } {
  const proposal = i.proposals.at(-1)
  if (i.workflow === "human_review") return { kind: "person", text: "Handed to a person: outside what the agent is allowed to handle" }
  if (i.state === "technical_error") return { kind: "person", text: "Could not finish (technical problem): a person must check and resume" }
  if (i.state === "needs_decision" && proposal) return { kind: "agent", text: `Proposed: ${proposal.summary} · waiting for your approval` }
  if (i.state === "approved" && proposal) return { kind: "agent", text: `Proposed and approved: ${proposal.summary} · not applied yet` }
  if (i.state === "resolved") return i.executions.length && proposal
    ? { kind: "agent", text: `Solved: ${proposal.summary} (applied after approval)` }
    : { kind: "agent", text: `Solved: ${i.stopReason ?? i.nextStep}` }
  if (i.state === "waiting") return { kind: "pending", text: "No decision yet: asked the driver and waiting for the reply" }
  if (paused(i)) return { kind: "pending", text: "No decision yet: stopped mid-investigation, resume needed" }
  return { kind: "pending", text: "No decision yet: investigating" }
}
