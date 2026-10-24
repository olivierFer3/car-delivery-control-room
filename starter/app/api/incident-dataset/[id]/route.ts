import { NextResponse } from "next/server"
import { getProblem, sourceRecords, evaluationsFor } from "@/lib/incidents/dataset"
import { datasetAgentConfigured, listDatasetRuns } from "@/lib/incidents/dataset-runs"
export const runtime = "nodejs"
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const p = await getProblem((await context.params).id)
    if (!p) return NextResponse.json({ error: "Problem not found" }, { status: 404 })
    const [sources, evaluations, agentConfigured, runs] = await Promise.all([sourceRecords(p), evaluationsFor(p.id), datasetAgentConfigured(), listDatasetRuns(p.id).then(runs => ({ runs, error: undefined as string | undefined })).catch(() => ({ runs: [], error: "Investigation history unavailable; check the local database connection." }))])
    return NextResponse.json({ problem: p, sources, evaluations, agentConfigured, runs: runs.runs, runStorageError: runs.error })
  } catch { return NextResponse.json({ error: "Unable to read the problem dataset" }, { status: 503 }) }
}
