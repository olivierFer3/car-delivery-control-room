import { randomUUID } from "node:crypto"
import type { Command, Incident, Scenario } from "./contracts"
import { createIncident, decide, executeApproved, explainIncident, receiveDriverReply, runAgent, WorkflowError } from "./engine"
import { configuredProviders } from "./providers"
import { insertIncident, insertOrGetIncident, mutateIncident, saveAgentCheckpoint, toolsData } from "./store"
import { orderSignals, sourceTimestamp } from "./operational"
import { SIMULATION_TIME } from "./contracts"
import { mockProposal } from "./mock"
import { syncThread } from "./activity"
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
/** Normal application path: explicit selected source, stable idempotent case, no model call at creation. */
export async function createOperationalIncident(orderId: string, signalId: string, provider?: string) {
  if(typeof orderId!=='string'||!orderId||orderId.length>100||typeof signalId!=='string'||!signalId||signalId.length>100)throw new WorkflowError('Valid order and source IDs required')
  const c=await toolsData.context(orderId);if(!c)throw new WorkflowError('Order not found')
  const signal=orderSignals(c).find(s=>s.id===signalId);if(!signal)throw new WorkflowError('Source must belong to the selected order')
  const chosen=provider??process.env.AGENT_PROVIDER??'gemini'
  if(!['groq','gemini'].includes(chosen))throw new WorkflowError('Unsupported configured provider; select Groq or Gemini')
  if(signal.supported&&!configuredProviders(chosen,false).length)throw new WorkflowError(`Configure ${chosen} credentials and an allowed model before starting; no mock reasoning is substituted`)
  const i=createIncident(orderId,signalId,'no_response');i.mode='llm';i.preferredProvider=chosen as 'groq'|'gemini';i.workflow=signal.supported?'ferry_delay':'human_review'
  // Reuse the existing episode uniqueness key without changing/dropping indexes or old demo histories.
  i.demoRunId='operational';i.summary=signal.summary
  for(const row of [c.order,...c.alerts.filter(r=>r.id===signalId),...c.reservations.filter(r=>r.id===signalId)])i.evidence.push({id:row.id,source:`dataset:${row.id}`,at:sourceTimestamp(row),text:JSON.stringify(row),kind:'record'})
  i.timeline.push({type:'simulation',at:SIMULATION_TIME,text:'Operational synthetic case: real LLM tools, explicit simulated driver replies, fictional unbooked alternatives; no real communications or purchases.'})
  if(!signal.supported){i.state='waiting';i.summary='Human review required: '+signal.summary;i.nextStep=signal.reason;i.stopReason=signal.reason;i.missing=['A supported workflow or human investigation'];i.timeline.push({type:'human_handoff',at:SIMULATION_TIME,text:signal.reason})}
  return insertOrGetIncident(i)
}
export async function commandIncidentService(id: string, command: Command): Promise<Incident> {
  if (!command || typeof command !== "object") throw new WorkflowError("Invalid command")
  if (command.command === "run" || command.command === "message") {
    const leaseId = randomUUID()
    const i = await mutateIncident(id,async i => {
      if(i.workflow==='human_review')throw new WorkflowError('Unsupported incident: human review required; no automated investigation or action is permitted')
      if (command.command === "run" && (i.mode !== "llm" || !["investigating","waiting","technical_error"].includes(i.state) || i.executions.length)) throw new WorkflowError("No runnable live investigation in this state")
      if (command.command === "message" && (typeof command.text !== "string" || !command.text.trim() || command.text.length > 4000)) throw new WorkflowError("Invalid operator message")
      if (i.activeRun) i.timeline.push({type:"recovery",text:"Expired agent lease replaced; persisted tool results retained",at:i.simulationTime})
      i.activeRun = {id:leaseId,expiresAt:new Date(Date.now()+110_000).toISOString()}
    })
    const providers = configuredProviders(i.preferredProvider,false)
    const checkpoint = async () => { syncThread(i); await saveAgentCheckpoint(i,leaseId) }
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
    syncThread(i)
  })
}
