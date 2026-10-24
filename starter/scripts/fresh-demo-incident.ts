/** Creates an isolated fictional replay; never reseeds, resets or deletes history. */
import "dotenv/config"
import assert from "node:assert/strict"
import { createIncident } from "../lib/incidents/engine"
import { initializeStore, insertIncident, listIncidents, toolsData } from "../lib/incidents/store"
import { mockProposal } from "../lib/incidents/mock"

async function main() {
  await initializeStore()
  const before = await listIncidents()
  const history = new Map(before.map(i => [i.id, JSON.stringify(i)]))
  const i = createIncident("ord-00603", "alert-x5259ff7f2e03f0e6", "delay")
  i.demoRunId = i.id
  i.timeline.push({ type: "demo_replay", text: "Fresh isolated iteration-1 simulation; earlier investigations retained", at: i.simulationTime })
  await mockProposal(i, toolsData)
  assert.equal(i.state, "needs_decision")
  assert.equal(i.proposals.length, 1)
  assert.equal(i.decisions.length, 0)
  assert.equal(i.executions.length, 0)
  await insertIncident(i)
  const after = await listIncidents()
  for (const [id, previous] of history) assert.equal(JSON.stringify(after.find(row => row.id === id)), previous, `Earlier history changed: ${id}`)
  assert.equal(after.length, before.length + 1)
  const base = process.env.APP_URL ?? "http://127.0.0.1:3001"
  console.log(`Created fresh incident awaiting version-1 decision: ${base}/incidents/${i.id}`)
  console.log(`Verified ${before.length} earlier incidents unchanged; no decisions or simulated actions executed.`)
}
main().then(() => process.exit(0)).catch(error => { console.error(error instanceof Error ? error.message : "Fresh demo creation failed"); process.exit(1) })
