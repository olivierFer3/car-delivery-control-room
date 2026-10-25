import type { PublicIncident } from "@/lib/incidents/contracts"
import styles from "./incidents.module.css"

type Tone = "decision" | "ready" | "active" | "waiting" | "technical" | "human" | "done" | "unchecked"

// Each status has a word and a glyph, so it reads without colour.
const INCIDENT: Record<PublicIncident["state"], { label: string; glyph: string; tone: Tone }> = {
  needs_decision: { label: "Needs your decision", glyph: "◆", tone: "decision" },
  approved: { label: "Approved · apply separately", glyph: "✓", tone: "ready" },
  investigating: { label: "Investigating", glyph: "◔", tone: "active" },
  waiting: { label: "Waiting for information", glyph: "‖", tone: "waiting" },
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

/** Who acts next, in plain words, from the incident state. */
export function responsible(incident: Pick<PublicIncident, "state" | "workflow">) {
  if (incident.workflow === "human_review") return "An operator handles this case manually"
  return {
    needs_decision: "You: approve, reject or ask for an alternative",
    approved: "You: apply the approved change, as a separate step",
    investigating: "The agent: running its checks",
    waiting: "Missing information: a driver reply or a fresh option is needed before the case continues",
    technical_error: "An operator: check the technical problem, then resume",
    resolved: "No one: the incident is closed (delivery is tracked separately)",
  }[incident.state]
}
