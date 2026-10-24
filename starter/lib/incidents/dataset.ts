import { readFile, stat, readdir } from "node:fs/promises"
import path from "node:path"
import type { CatalogProblem, CatalogResponse, DatasetKey, ProblemCard, Problem, SourceRef, DatasetDetail } from "./dataset-contracts"
const files: Record<DatasetKey, string> = { bahn: "problems.jsonl", hand: "test_cases.jsonl", generated: "test_cases_generated.jsonl", synthetic: "test_cases_synthetic.jsonl" }
export const projectRoot = path.resolve(process.cwd(), "..")
const root = path.resolve(/* turbopackIgnore: true */ process.env.PROBLEMS_DIR ?? path.join(projectRoot, "agent/problems/data"))
let cached: { signature: string; rows: CatalogProblem[] } | undefined
export async function loadProblems(): Promise<CatalogProblem[]> {
  const entries = Object.entries(files) as [DatasetKey, string][]
  const stamps = await Promise.all(entries.map(async ([, name]) => { try { const s = await stat(path.join(root, name)); return `${s.mtimeMs}:${s.size}` } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT" && name !== "problems.jsonl") return "missing"; throw e } }))
  const signature = stamps.join("|")
  if (cached?.signature === signature) return cached.rows
  const groups = await Promise.all(entries.map(async ([dataset, file], n) => {
    if (stamps[n] === "missing") return []
    return (await readFile(path.join(root, file), "utf8")).split(/\r?\n/).filter(s => s.trim()).map((line, index) => {
      const row = JSON.parse(line) as Problem
      if (!row.id || !["1.0", "1.1"].includes(row.schema_version) || !["open", "resolved", "scenario"].includes(row.status) || !row.source || !row.solution || !Array.isArray(row.timeline) || !Array.isArray(row.next_actions) || !Array.isArray(row.agent_work) || !Array.isArray(row.human_decisions)) throw new Error(`Invalid problem ${file}:${index + 1}`)
      return { ...row, dataset }
    })
  }))
  const rows = groups.flat(), ids = new Set<string>()
  for (const row of rows) { if (ids.has(row.id)) throw new Error(`Duplicate problem id: ${row.id}`); ids.add(row.id) }
  cached = { signature, rows }; return rows
}
export async function getProblem(id: string) { return (await loadProblems()).find(p => p.id === id) ?? null }
export function queryProblems(rows: CatalogProblem[], params: URLSearchParams): CatalogResponse {
  const dataset = params.get("dataset") ?? "bahn", q = (params.get("q") ?? "").trim().toLocaleLowerCase(), status = params.get("status"), domain = params.get("domain"), type = params.get("type"), severity = params.get("severity"), solution = params.get("solution")
  const selected = rows.filter(p => dataset === "all" || p.dataset === dataset)
  const counts = Object.fromEntries(Object.keys(files).map(k => [k, rows.filter(p => p.dataset === k).length])) as Record<DatasetKey, number>
  const filtered = selected.filter(p => (!status || p.status === status) && (!domain || p.domain === domain) && (!type || p.problem_type === type) && (!severity || p.severity === severity) && (!solution || p.solution.status === solution) && (!q || [p.id, p.order?.reference, p.order?.vehicle, p.summary, p.domain, p.problem_type, ...p.owners, ...p.waiting_on, ...p.timeline.map(m => m.text)].filter(Boolean).join(" ").toLocaleLowerCase().includes(q)))
  const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  filtered.sort((a, b) => Number(a.status === "resolved") - Number(b.status === "resolved") || (rank[a.severity ?? ""] ?? 4) - (rank[b.severity ?? ""] ?? 4) || (b.opened_at ?? "").localeCompare(a.opened_at ?? "") || a.id.localeCompare(b.id))
  const pages = Math.max(1, Math.ceil(filtered.length / 30)), requested = Number(params.get("page") ?? 1), page = Math.min(pages, Math.max(1, Number.isFinite(requested) ? Math.floor(requested) : 1))
  const items: ProblemCard[] = filtered.slice((page - 1) * 30, page * 30).map(p => ({ id: p.id, dataset: p.dataset, order: p.order, problem_type: p.problem_type, domain: p.domain, phase: p.phase, severity: p.severity, status: p.status, summary: p.summary, owners: p.owners, waiting_on: p.waiting_on, opened_at: p.opened_at, solutionStatus: p.solution.status, nextStep: p.next_actions[0]?.text ?? null, decisionCount: p.human_decisions.length }))
  return { items, total: filtered.length, page, pages, counts, facets: { domains: [...new Set(selected.map(p => p.domain))].sort(), types: [...new Set(selected.map(p => p.problem_type))].sort() }, statusCounts: Object.fromEntries(["open", "resolved", "scenario"].map(s => [s, selected.filter(p => p.status === s).length])) }
}
export async function sourceRecords(p: CatalogProblem) {
  const refs = [...p.source.records, ...p.evidence_refs, ...p.solution.sources, ...p.next_actions.map(a => a.source)]
  const unique = [...new Map(refs.map(r => [`${r.table}:${r.id}`, r])).values()]
  const tables = new Map<string, Map<string, unknown>>()
  await Promise.all([...new Set(unique.map(r => r.table))].map(async name => {
    if (!/^[a-z_]+$/.test(name)) return
    try { const rows = (await readFile(path.resolve(process.env.DATASET_DIR ?? path.join(projectRoot, "dataset/data"), `${name}.jsonl`), "utf8")).split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s)); tables.set(name, new Map(rows.map(r => [r.id, r]))) }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e }
  }))
  return unique.map((ref: SourceRef) => ({ ref, record: tables.get(ref.table)?.get(ref.id) ?? null }))
}
export async function evaluationsFor(id: string): Promise<DatasetDetail["evaluations"]> {
  const folder = path.join(projectRoot, "agent/eval_results")
  let dirs; try { dirs = await readdir(folder, { withFileTypes: true }) } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e }
  const found = await Promise.all(dirs.filter(d => d.isDirectory()).map(async d => {
    try {
      const lines = (await readFile(path.join(folder, d.name, "results.jsonl"), "utf8")).split(/\r?\n/).filter(Boolean).map(s => JSON.parse(s))
      return lines.filter(r => r.case?.id === id && r.trace).map(r => ({ report: d.name, trace: r.trace, score: r.score ?? r.scores ?? null }))
    } catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return []; throw e }
  })); return found.flat()
}
