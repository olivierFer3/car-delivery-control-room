import postgres from "postgres"
import { stat } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { execFile } from "node:child_process"
import path from "node:path"
import { getProblem, projectRoot, sourceRecords } from "./dataset"
import type { AgentTrace, DatasetRun } from "./dataset-contracts"
import { applyDatasetReview, parseAgentTrace } from "./dataset-review"
import { investigationInput } from "./dataset-input"
import { WorkflowError } from "./engine"
let client: ReturnType<typeof postgres> | undefined
const sql = () => { if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required"); return client ??= postgres(process.env.DATABASE_URL, { max: 3, connect_timeout: 5 }) }
export async function datasetAgentConfigured() {
  if (process.env.GROQ_API_KEY?.trim()) return true
  try { return (await stat(path.join(projectRoot, "groq_api_key.txt"))).size > 0 } catch { return false }
}
async function ready() { await sql()`CREATE TABLE IF NOT EXISTS control_room_dataset_runs (id text PRIMARY KEY, problem_id text NOT NULL, body jsonb NOT NULL)` }
export async function recentDatasetRuns(): Promise<DatasetRun[]> {
  await ready()
  const rows = await sql()`SELECT body FROM control_room_dataset_runs ORDER BY body->>'startedAt' DESC LIMIT 20`
  return rows.map(r => r.body as DatasetRun)
}
export async function listDatasetRuns(problemId: string): Promise<DatasetRun[]> {
  await ready()
  const rows = await sql()`SELECT body FROM control_room_dataset_runs WHERE problem_id = ${problemId} ORDER BY body->>'startedAt' DESC`
  return rows.map(r => {
    const run = r.body as DatasetRun
    return run.state === "running" && Date.now() - Date.parse(run.startedAt) > 125_000 ? { ...run, state: "technical_error", error: "Agent run interrupted or timed out; start a new investigation explicitly." } : run
  })
}
export async function launchDatasetRun(problemId: string) {
  const problem = await getProblem(problemId)
  if (!problem) throw new WorkflowError("Problem not found")
  if (!await datasetAgentConfigured()) throw new WorkflowError("Agent connection required. Configure Groq locally before investigating.")
  await ready()
  const run: DatasetRun = { id: randomUUID(), problemId, state: "running", startedAt: new Date().toISOString(), decisions: [] }
  await sql().begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${problemId}))`
    const active = await tx`SELECT id FROM control_room_dataset_runs WHERE problem_id = ${problemId} AND body->>'state' = 'running' AND (body->>'startedAt')::timestamptz > now() - interval '125 seconds'`
    if (active.length) throw new WorkflowError("An investigation is already running for this case. Refresh to follow it.")
    await tx`INSERT INTO control_room_dataset_runs (id, problem_id, body) VALUES (${run.id}, ${problemId}, ${tx.json(JSON.parse(JSON.stringify(run)))})`
  })
  try {
    // Pass only intake, attributed facts and simulated personas. Never the reference answer.
    const sources = await sourceRecords(problem)
    const previous = (await listDatasetRuns(problemId)).find(r => r.id !== run.id)?.decisions.at(-1)
    const payload = investigationInput(problem, sources, previous && ["reject", "alternative"].includes(previous.choice) ? previous.comment : undefined)
    const trace = await new Promise<AgentTrace>((resolve, reject) => {
      const child = execFile("python3", [path.join(projectRoot, "agent/dashboard_runner.py")], { cwd: projectRoot, timeout: 120_000, killSignal: "SIGKILL", maxBuffer: 2 * 1024 * 1024, env: { ...process.env, PYTHONUNBUFFERED: "1" } }, (error, stdout) => {
        if (error) { reject(new Error("Agent process failed or exceeded 120 seconds. No business conclusion or action was applied.")); return }
        try { resolve(parseAgentTrace(JSON.parse(stdout))) } catch { reject(new Error("Agent returned an invalid result; no action applied.")) }
      })
      child.stdin?.on("error", () => {})
      child.stdin?.end(JSON.stringify(payload))
    })
    run.trace = trace
    run.state = trace.error || !trace.finish || trace.violations.length ? "technical_error" : "finished"
    if (run.state === "technical_error") run.error = trace.violations.length ? "A prohibited action was attempted and blocked. Review the trace; no booking or customer message was executed." : "The agent could not complete the investigation. No business conclusion inferred."
  } catch (e) { run.state = "technical_error"; run.error = e instanceof Error ? e.message : "Agent unavailable" }
  run.finishedAt = new Date().toISOString()
  await sql()`UPDATE control_room_dataset_runs SET body = ${sql().json(JSON.parse(JSON.stringify(run)))} WHERE id = ${run.id}`
  return run
}
export async function reviewDatasetRun(problemId: string, runId: string, choice: string, comment: string) {
  if (!["approve", "reject", "alternative"].includes(choice) || typeof comment !== "string" || comment.length > 4000) throw new WorkflowError("Invalid review")
  await ready()
  return sql().begin(async tx => {
    const [row] = await tx`SELECT body FROM control_room_dataset_runs WHERE id = ${runId} AND problem_id = ${problemId} FOR UPDATE`
    if (!row) throw new WorkflowError("Investigation not found")
    const run = row.body as DatasetRun
    applyDatasetReview(run, choice, comment)
    await tx`UPDATE control_room_dataset_runs SET body = ${tx.json(JSON.parse(JSON.stringify(run)))} WHERE id = ${runId}`
    return run
  })
}
