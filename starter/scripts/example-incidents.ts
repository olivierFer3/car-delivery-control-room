import { readFile, mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { createIncident, decide, executeApproved, type RecordRow, type ToolsData } from "../lib/incidents/engine"
import { mockProposal } from "../lib/incidents/mock"
import { simulatedTravelOptions } from "../lib/incidents/fixtures"
import { publicIncident } from "../lib/incidents/http"
async function rows(name: string): Promise<RecordRow[]> { return (await readFile(path.resolve(process.env.DATASET_DIR ?? "../dataset/data", `${name}.jsonl`), "utf8")).trim().split("\n").map(s => JSON.parse(s)) }
async function main() {
const [orders, alerts, messages, reservations, options] = await Promise.all(["orders", "alerts", "messages", "travel_reservations", "travel_options"].map(rows))
const data: ToolsData = { async context(id) { const order = orders.find(x => x.id === id); if (!order) return null; const forOrder = (rs: RecordRow[]) => rs.filter(x => x.order_id === id); return { order, alerts: forOrder(alerts), messages: forOrder(messages), reservations: forOrder(reservations), options: [...forOrder(options), ...simulatedTravelOptions(id)] } }, similar: async () => [] }
const i = createIncident("ord-00603", "alert-x5259ff7f2e03f0e6", "delay")
i.id = "demo-ferry-603"
await mockProposal(i, data)
const pending = structuredClone(publicIncident(i))
decide(i, { command: "decide", version: 1, choice: "approve", operator: "demo-operator", comment: "Reviewed fictional cost and departure" })
executeApproved(i, 1)
const dir = path.resolve("../docs/examples")
await mkdir(dir, { recursive: true })
await writeFile(path.join(dir, "incident-responses.json"), JSON.stringify({ pending, executed: publicIncident(i) }, null, 2) + "\n")
console.log("Generated UI fixtures from CD-420603 snapshot + explicitly simulated quotes")

}
main().catch(error => { console.error(error); process.exitCode = 1 })
