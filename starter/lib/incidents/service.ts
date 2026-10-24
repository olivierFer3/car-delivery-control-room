import { randomUUID } from "node:crypto"
import type { Command, Incident, Scenario } from "./contracts"
import { createIncident, decide, executeApproved, explainIncident, receiveDriverReply, runAgent, WorkflowError } from "./engine"
import { configuredProviders } from "./providers"
import { insertIncident, mutateIncident, saveAgentCheckpoint, toolsData } from "./store"
import { mockProposal } from "./mock"
export async function createLiveIncident(scenario: Scenario, provider: "groq" | "gemini") {
  if (!["delay","disproved","no_response","contradiction"].includes(scenario) || !["groq","gemini"].includes(provider)) throw new WorkflowError("Invalid live-agent scenario or provider")
  if (!configuredProviders(provider,false).length) throw new WorkflowError(`Configure ${provider} credentials and an allowed model before starting`)
  const i = createIncident("ord-00603","alert-x5259ff7f2e03f0e6",scenario)
  i.mode = "llm"; i.preferredProvider = provider; i.demoRunId = i.id
  i.timeline.push({type:"simulation",at:i.simulationTime,text:"Real model investigation; driver and ferry services are explicitly fictional. Original snapshot and earlier incidents retained."})
  const c = await toolsData.context(i.orderId)
  if (!c?.alerts.some(a=>a.id===i.signalId)) throw new WorkflowError("Seeded ferry order and source alert are required")
  await insertIncident(i); return i
}
export async function commandIncidentService(id: string, command: Command): Promise<Incident> {
  if (!command || typeof command !== "object") throw new WorkflowError("Invalid command")
  if (command.command === "run" || command.command === "message") {
    const leaseId = randomUUID()
    const i = await mutateIncident(id,async i => {
      if (command.command === "run" && (i.mode !== "llm" || !["investigating","waiting","technical_error"].includes(i.state) || i.executions.length)) throw new WorkflowError("No runnable live investigation in this state")
      if (command.command === "message" && (typeof command.text !== "string" || !command.text.trim() || command.text.length > 4000)) throw new WorkflowError("Invalid operator message")
      if (i.activeRun) i.timeline.push({type:"recovery",text:"Expired agent lease replaced; persisted tool results retained",at:i.simulationTime})
      i.activeRun = {id:leaseId,expiresAt:new Date(Date.now()+110_000).toISOString()}
    })
    const providers = configuredProviders(i.preferredProvider,false)
    const checkpoint = () => saveAgentCheckpoint(i,leaseId)
    try {
      if (command.command === "run") await runAgent(i,toolsData,providers,checkpoint)
      else await explainIncident(i,command.text,providers)
    } finally { delete i.activeRun; await checkpoint() }
    return i
  }
  return mutateIncident(id,async i => {
    switch(command.command) {
      case "mock_proposal": if(i.mode === "llm") throw new WorkflowError("Mock reasoning is disabled for a real-agent incident"); await mockProposal(i,toolsData); break
      case "decide": decide(i,command); break
      case "execute": executeApproved(i,command.version); i.stopReason = i.executions.at(-1)?.reason; break
      case "receive_driver_reply": receiveDriverReply(i,command); break
      default: throw new WorkflowError("Unknown incident command")
    }
  })
}
