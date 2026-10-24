import { NextResponse } from "next/server"
import { loadProblems, queryProblems } from "@/lib/incidents/dataset"
import { recentDatasetRuns } from "@/lib/incidents/dataset-runs"
export const runtime = "nodejs"
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams, selected = params.get("dataset") ?? "bahn"
    const problems = await loadProblems(), catalog = queryProblems(problems, params)
    const runs = await recentDatasetRuns().catch(() => [])
    const investigations = runs.flatMap(run => {
      const problem = problems.find(p => p.id === run.problemId)
      return problem && (selected === "all" || problem.dataset === selected) ? [{ ...run, dataset: problem.dataset, reference: problem.order?.reference ?? null }] : []
    })
    return NextResponse.json({ ...catalog, investigations })
  }
  catch { return NextResponse.json({ error: "Problem dataset unavailable or invalid. Check agent/problems/data and validate.py." }, { status: 503 }) }
}
