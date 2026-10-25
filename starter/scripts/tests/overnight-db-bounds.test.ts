import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { test } from "node:test"
import postgres from "postgres"

// No DATABASE_URL fallback: supply only an explicitly disposable database.
const isolatedUrl = process.env.OVERNIGHT_TEST_DATABASE_URL
async function regression() {
  assert.ok(isolatedUrl, "OVERNIGHT_TEST_DATABASE_URL must name a disposable PostgreSQL database")
  process.env.DATABASE_URL = isolatedUrl
  const store = await import("../../lib/incidents/store")
  const { createIncident, WorkflowError } = await import("../../lib/incidents/engine")
  const db = postgres(isolatedUrl, { max: 1 })
  try {
    await store.initializeStore()
    const incident = createIncident("overnight-lock-order", "overnight-lock-signal", "no_response")
    incident.demoRunId = incident.id
    await store.insertIncident(incident)
    async function boundedFailure(operation: () => Promise<unknown>, code = "55P03") {
      const started = Date.now()
      await assert.rejects(operation, error => {
        assert.ok(!(error instanceof WorkflowError), "Storage failure must remain technical")
        assert.equal((error as { code?: string }).code, code)
        return true
      })
      assert.ok(Date.now() - started < 4500, "Product DB operation exceeded 4.5 seconds")
    }
    await db.begin(async tx => {
      await tx`LOCK TABLE control_room_incidents IN ACCESS EXCLUSIVE MODE`
      await boundedFailure(() => store.getIncident(incident.id))
      await boundedFailure(() => store.mutateIncident(incident.id, async i => { i.summary = "must not commit" }))
      await boundedFailure(() => store.saveAgentCheckpoint(incident, "nonexistent-lease"))
    })
    const persisted = await store.getIncident(incident.id)
    assert.equal(persisted?.summary, incident.summary)
    assert.deepEqual(persisted?.decisions, [])
    assert.deepEqual(persisted?.executions, [])
    await store.mutateIncident(incident.id, async i => { i.summary = "recovered after lock release" })
    assert.equal((await store.getIncident(incident.id))?.summary, "recovered after lock release")
    // A slow statement without a conflicting lock exercises statement_timeout.
    await db`CREATE FUNCTION overnight_slow_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(10); RETURN NEW; END $$`
    await db`CREATE TRIGGER overnight_slow_update BEFORE UPDATE ON control_room_incidents
      FOR EACH ROW EXECUTE FUNCTION overnight_slow_update()`
    try {
      await boundedFailure(() => store.mutateIncident(incident.id, async i => { i.summary = "slow write must roll back" }), "57014")
    } finally {
      await db`DROP TRIGGER overnight_slow_update ON control_room_incidents`
      await db`DROP FUNCTION overnight_slow_update()`
    }
    assert.equal((await store.getIncident(incident.id))?.summary, "recovered after lock release")
    await db`DELETE FROM control_room_incidents WHERE id = ${incident.id}`
  } finally { await db.end({ timeout: 1 }) }
}
if (process.argv.includes("--worker")) {
  regression().then(() => process.exit(0), error => { console.error(error); process.exit(1) })
} else {
  test("locked product reads, mutations and checkpoints fail promptly and roll back", { skip: !isolatedUrl }, () => {
    const child = spawnSync(process.execPath, ["--import", "tsx", process.argv[1], "--worker"], {
      env: process.env, encoding: "utf8", timeout: 15000,
    })
    assert.equal(child.error, undefined, child.error?.message)
    assert.equal(child.status, 0, child.stdout + child.stderr)
  })
}
