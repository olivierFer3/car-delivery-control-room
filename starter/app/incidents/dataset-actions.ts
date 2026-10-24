"use server"
import { operatorAccess } from "./actions"
import { launchDatasetRun, reviewDatasetRun } from "@/lib/incidents/dataset-runs"
import { WorkflowError } from "@/lib/incidents/engine"
export async function investigateProblem(id: string) {
  if (!await operatorAccess()) return { error: "Unlock operator access before starting an investigation." }
  try { return { run: await launchDatasetRun(id) } } catch (e) { return { error: e instanceof WorkflowError ? e.message : "Could not start investigation; check local database and Groq configuration." } }
}
export async function reviewProblemRun(problemId: string, runId: string, choice: string, comment: string) {
  if (!await operatorAccess()) return { error: "Unlock operator access before making a decision." }
  try { return { run: await reviewDatasetRun(problemId, runId, choice, comment) } } catch (e) { return { error: e instanceof WorkflowError ? e.message : "Could not save the decision. Refresh before retrying." } }
}
