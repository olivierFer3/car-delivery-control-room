import { applyDatasetReview, parseAgentTrace } from "../../lib/incidents/dataset-review"
import type { DatasetRun } from "../../lib/incidents/dataset-contracts"
import { investigationInput } from "../../lib/incidents/dataset-input"
import { test } from "node:test"
import assert from "node:assert/strict"
import { loadProblems, queryProblems, sourceRecords, evaluationsFor, getProblem } from "../../lib/incidents/dataset"
let rows: Awaited<ReturnType<typeof loadProblems>>
test("all four files are loaded with unique stable ids", async () => {
  rows = await loadProblems(); assert.equal(rows.length, 3977); assert.equal(new Set(rows.map(p => p.id)).size, rows.length)
  const result = queryProblems(rows, new URLSearchParams()); assert.deepEqual(result.counts, { bahn: 74, hand: 31, generated: 22, synthetic: 3850 }); assert.equal(result.total, 74); assert.equal(result.items.length, 30); assert.equal(result.statusCounts.open, 37)
})
test("combined status/domain/type/severity/search/solution filters use real fields", async () => {
  rows ??= await loadProblems()
  const result = queryProblems(rows, new URLSearchParams({ q: "Bentley", status: "open", domain: "on_the_road", type: "VEHICLE_WARNING", severity: "critical", solution: "planned" }))
  assert.ok(result.items.some(p => p.order?.reference === "CD-420322")); assert.ok(result.items.every(p => p.domain === "on_the_road" && p.status === "open"))
  assert.equal(queryProblems(rows, new URLSearchParams({ q: "__no_such_case__" })).total, 0)
})
test("pagination covers every synthetic case exactly once and clamps invalid pages", async () => {
  rows ??= await loadProblems(); const ids = new Set<string>(), params = new URLSearchParams({ dataset: "synthetic" })
  const first = queryProblems(rows, params); assert.equal(first.total, 3850)
  for (let n = 1; n <= first.pages; n++) { params.set("page", String(n)); for (const p of queryProblems(rows, params).items) { assert.equal(ids.has(p.id), false); ids.add(p.id) } }
  assert.equal(ids.size, 3850); params.set("page", "NaN"); assert.equal(queryProblems(rows, params).page, 1); params.set("page", "-4"); assert.equal(queryProblems(rows, params).page, 1)
})
test("test references never appear as operational outcomes or leak through list cards", async () => {
  rows ??= await loadProblems(); const result = queryProblems(rows, new URLSearchParams({ dataset: "hand" })); assert.ok(result.items.every(p => p.status === "scenario" && p.solutionStatus === "expected")); assert.ok(result.items.every(p => !("test" in p) && !("solution" in p)))
})
test("source records resolve to original dataset ids; unlinked cases stay unlinked", async () => {
  const problem = await getProblem("bahn-21a8e9a0b5ec"); assert.ok(problem); const sources = await sourceRecords(problem); assert.ok(sources.length); assert.ok(sources.every(s => s.record && (s.record as {id: string}).id === s.ref.id))
  assert.equal(await getProblem("../../groq_api_key.txt"), null)
})
test("saved evaluations are matched by case id", async () => { const results = await evaluationsFor("test-0010"); assert.ok(results.length); assert.ok(results.every(r => r.trace.case_id === "test-0010")); assert.deepEqual(await evaluationsFor("unknown-case"), []) })

test("agent input excludes expected answers, reference solutions and prior approvals", async () => {
  rows ??= await loadProblems()
  for (const p of rows.filter(p => p.test)) {
    const payload = investigationInput(p, [])
    assert.equal("solution" in payload, false); assert.equal("expected" in payload.test, false)
    assert.deepEqual(payload.test.given, p.test!.given)
  }
  const payload = investigationInput(rows[0], [], "Find a cheaper option")
  assert.match(payload.summary, /Find a cheaper option/); assert.match(payload.summary, /not approval/)
})

test("review targets one saved recommendation; duplicate and blocked reviews fail", () => {
  const run: DatasetRun = { id: "run-version-1", problemId: "test-0010", state: "finished", startedAt: "2026-10-24T00:00:00Z", decisions: [], trace: { steps: [], violations: [], error: null, finish: { handoff: "person_decides", recommendation: "Review a fictional quote" } } }
  applyDatasetReview(run, "approve", "Reviewed this recommendation")
  assert.equal(run.decisions.length, 1); assert.throws(() => applyDatasetReview(run, "approve", ""), /already has a decision/)
  const next = { ...structuredClone(run), id: "run-version-2", decisions: [] }
  assert.equal(next.decisions.length, 0); applyDatasetReview(next, "alternative", "Cheaper option")
  const blocked = { ...structuredClone(run), decisions: [], trace: { ...run.trace!, violations: [{ tool: "book_or_pay", args: {} }] } }
  assert.throws(() => applyDatasetReview(blocked, "approve", ""), /No reviewable/)
  assert.throws(() => applyDatasetReview({ ...structuredClone(run), decisions: [], state: "technical_error" }, "approve", ""), /No reviewable/)
})
test("malformed model outputs never become reviewable UI data", () => {
  assert.throws(() => parseAgentTrace({ steps: [], violations: [], finish: { handoff: "person_decides", needs_approval: "pay anything" } }), /Invalid agent/)
  assert.throws(() => parseAgentTrace({ steps: [], violations: [], finish: { handoff: "approve_myself" } }), /Invalid agent/)
  assert.equal(parseAgentTrace({ steps: [], violations: [], error: "Provider unavailable", finish: null }).finish, null)
})
