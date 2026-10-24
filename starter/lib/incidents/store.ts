import postgres from "postgres"
import { simulatedTravelOptions } from "./fixtures"
import type { Incident } from "./contracts"
import type { Context, RecordRow, ToolsData } from "./engine"
import { WorkflowError } from "./engine"
let connection: ReturnType<typeof postgres> | undefined
function sql() { if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required"); return connection ??= postgres(process.env.DATABASE_URL, { max: 5 }) }
export async function initializeStore() {
  await sql()`CREATE TABLE IF NOT EXISTS control_room_incidents (id text PRIMARY KEY, body jsonb NOT NULL)`
  // Repair earlier double-encoded JSON while preserving every incident history.
  await sql()`UPDATE control_room_incidents SET body = (body #>> '{}')::jsonb WHERE jsonb_typeof(body) = 'string'`
  // Isolate explicit demo replays while retaining one normal incident per signal.
  // Index migration preserves every stored incident and its audit history.
  await sql()`CREATE UNIQUE INDEX IF NOT EXISTS control_room_incident_episode ON control_room_incidents ((body->>'orderId'), (body->>'signalId'), (COALESCE(body->>'demoRunId', '')))`
  await sql()`DROP INDEX IF EXISTS control_room_incident_signal`
}
export async function insertIncident(i: Incident) { await sql()`INSERT INTO control_room_incidents (id, body) VALUES (${i.id}, ${sql().json(JSON.parse(JSON.stringify(i)))})` }
/** Reopening the demo returns its history, including under concurrent create clicks. */
export async function insertOrGetIncident(i: Incident): Promise<Incident> {
  const [row] = await sql()`INSERT INTO control_room_incidents (id, body) VALUES (${i.id}, ${sql().json(JSON.parse(JSON.stringify(i)))})
    ON CONFLICT ((body->>'orderId'), (body->>'signalId'), (COALESCE(body->>'demoRunId', ''))) DO UPDATE SET body = control_room_incidents.body
    RETURNING body`
  return row.body as Incident
}
export async function listIncidents(query = "") {
  const rows = await sql()`SELECT body FROM control_room_incidents ORDER BY id`
  const q = query.toLowerCase()
  return rows.map(r => r.body as Incident).filter(i => `${i.orderId} ${i.summary} ${i.state}`.toLowerCase().includes(q))
}
export async function getIncident(id: string): Promise<Incident | null> { const [r] = await sql()`SELECT body FROM control_room_incidents WHERE id = ${id}`; return r?.body ?? null }
/** Row lock serializes approve/revise/execute across processes, including duplicate HTTP requests.
 * Simulated effects and their receipt commit atomically in this overlay. No external side effects. */
export async function mutateIncident(id: string, mutate: (i: Incident) => Promise<void>) {
  return sql().begin(async tx => {
    const [row] = await tx`SELECT body FROM control_room_incidents WHERE id = ${id} FOR UPDATE`
    if (!row) throw new WorkflowError("Incident not found")
    const i = row.body as Incident
    await mutate(i)
    await tx`UPDATE control_room_incidents SET body = ${tx.json(JSON.parse(JSON.stringify(i)))} WHERE id = ${id}`
    return i
  })
}
export const toolsData: ToolsData = {
  async context(orderId) {
    const [order] = await sql()`SELECT details FROM orders WHERE id = ${orderId}`
    if (!order) return null
    const [alerts, messages, related] = await Promise.all([
      sql()`SELECT details FROM alerts WHERE order_id = ${orderId}`,
      sql()`SELECT details FROM messages WHERE order_id = ${orderId} ORDER BY authored_at`,
      sql()`SELECT collection, details FROM related_records WHERE order_id = ${orderId}`,
    ])
    const records = (name: string) => related.filter(r => r.collection === name).map(r => r.details as RecordRow)
    // Preserve full snapshot relationships alongside the focused travel tools.
    return { order: order.details, alerts: alerts.map(r => r.details), messages: messages.map(r => r.details), reservations: records("travel_reservations"), options: [...records("travel_options"), ...simulatedTravelOptions(orderId)], related: Object.fromEntries([...new Set(related.map(r => r.collection))].map(name => [name, records(name)])) } as Context
  },
  async similar(query, exceptId) { return (await listIncidents(query)).filter(i => i.id !== exceptId).slice(0, 5).map(i => ({ id: i.id, orderId: i.orderId, summary: i.summary, state: i.state, nextStep: i.nextStep })) },
}
