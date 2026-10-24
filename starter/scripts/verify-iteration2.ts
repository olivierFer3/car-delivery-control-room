import "dotenv/config"
import assert from "node:assert/strict"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { createLiveIncident, commandIncidentService } from "../lib/incidents/service"
import { initializeStore, getIncident, listIncidents, toolsData } from "../lib/incidents/store"
import { configuredProviders } from "../lib/incidents/providers"
import type { Incident } from "../lib/incidents/contracts"
const provider = process.argv.includes("--gemini") ? "gemini" : "groq"
const earlyOnly = process.argv.includes("--early-only")
const resumeId = process.argv.includes("--resume") ? process.argv[process.argv.indexOf("--resume")+1] : undefined
async function main() {
  if(process.argv.includes("--check-models")) {
    for(const name of ["groq","gemini"]) {
      const key=process.env[name==="groq"?"GROQ_API_KEY":"GEMINI_API_KEY"]
      if(!key){console.log(`${name}: key absent`);continue}
      const r=await fetch(name==="groq"?"https://api.groq.com/openai/v1/models":"https://generativelanguage.googleapis.com/v1beta/models",{headers:name==="groq"?{Authorization:`Bearer ${key}`}:{"x-goog-api-key":key},signal:AbortSignal.timeout(15000)})
      if(!r.ok){console.log(JSON.stringify({provider:name,http:r.status}));continue}
      const body=await r.json();console.log(JSON.stringify({provider:name,http:r.status,models:(body.data??body.models).filter((m:{id?:string;name?:string;supportedGenerationMethods?:string[]})=>name==="groq"?/gpt-oss|llama-3.3/.test(m.id??""):m.supportedGenerationMethods?.includes("generateContent")).map((m:{id?:string;name?:string})=>m.id??m.name)}))
    }
    return
  }
  assert.ok(configuredProviders(provider,false).length,`${provider} not configured`)
  await initializeStore()
  const before=await listIncidents(), original=new Map(before.filter(i=>i.id!==resumeId).map(i=>[i.id,JSON.stringify(i)])), orderBefore=await toolsData.context("ord-00603")
  const cases:Incident[]=[]
  const artifact=path.resolve(`../docs/verification/iteration2-live-${provider}.json`)
  const save=async()=>{await mkdir(path.dirname(artifact),{recursive:true});await writeFile(artifact,JSON.stringify({verifiedAt:new Date().toISOString(),provider,cases},null,2)+"\n")}
  async function retryCommand(id:string,command:Parameters<typeof commandIncidentService>[1]) {
    let i=await commandIncidentService(id,command)
    for(let attempt=0;attempt<2 && i.lastAgentError && /429/.test(i.lastAgentError);attempt++) {
      console.log(`Provider rate limit recorded. Explicit verification retry ${attempt+1}/2 in 30 seconds; persisted results retained.`)
      await new Promise(resolve=>setTimeout(resolve,30000));i=await commandIncidentService(id,command)
    }
    return i
  }
  async function run(scenario:Incident["scenario"]) {
    let i=(resumeId && (scenario==="delay" || earlyOnly) ? await getIncident(resumeId) : await createLiveIncident(scenario,provider))!;assert.ok(i);cases.push(i);console.log(`LIVE ${provider} ${scenario}: ${i.id}`)
    if(!i.proposals.length) i=await retryCommand(i.id,{command:"run"});cases[cases.length-1]=i;await save()
    console.log(JSON.stringify({id:i.id,state:i.state,stop:i.stopReason,model:i.modelTurns?.at(-1)?.actualModel??i.modelTurns?.at(-1)?.model,selectedTools:i.modelTurns?.map(t=>t.selected?.tool??t.error)}))
    return i
  }
  try {
    if(!earlyOnly){
      let late=await run("delay");assert.ok(late.proposals.length>0,late.lastAgentError??late.stopReason)
      assert.ok(late.modelTurns?.every(t=>t.provider===provider));assert.ok(late.modelTurns?.some(t=>t.selected?.tool==="check_booking_constraints"));assert.ok(late.modelTurns?.some(t=>t.selected?.tool==="search_travel_options"))
      await assert.rejects(()=>commandIncidentService(late.id,{command:"execute",version:1}),/approval/)
      const proposed=JSON.stringify(late.proposals)
      const stateBeforeExplanation=late.state
      if(!late.conversation.some(m=>m.role==="agent")) {
        late=await retryCommand(late.id,{command:"message",text:"Why is this option feasible? Cite the ETA, original cutoff and the limits of the quoted price. Explain without changing the proposal."})
        assert.equal(late.lastAgentError,undefined)
      }
      assert.equal(late.conversation.at(-1)?.role,"agent");assert.equal(JSON.stringify(late.proposals),proposed);assert.equal(late.state,stateBeforeExplanation)
      await commandIncidentService(late.id,{command:"decide",version:1,choice:"alternative",operator:"verification-operator",comment:"Find a different feasible quoted sailing. A higher cost is acceptable if explained. Use the existing current quotes and preserve the customer promise."})
      late=await retryCommand(late.id,{command:"run"});cases[0]=late;await save();assert.equal(late.state,"needs_decision",late.lastAgentError??late.stopReason);assert.equal(late.proposals.at(-1)?.version,2)
      await assert.rejects(()=>commandIncidentService(late.id,{command:"decide",version:1,choice:"approve",operator:"verification-operator",comment:"stale"}),/Stale/)
      await commandIncidentService(late.id,{command:"decide",version:2,choice:"approve",operator:"verification-operator",comment:"Explicit test approval of the saved fictional actions only"})
      assert.equal((await getIncident(late.id))!.executions.length,0)
      const receipts=await Promise.all([commandIncidentService(late.id,{command:"execute",version:2}),commandIncidentService(late.id,{command:"execute",version:2})]);assert.ok(receipts.every(i=>i.executions.length===1));cases[0]=(await getIncident(late.id))!;await save()
      console.log("PASS: live late proposal, live explanation, alternative version, stale/unapproved rejection, approval then one concurrent duplicate-safe fictional execution")
    }
    const early=await run("disproved");assert.equal(early.state,"resolved",early.lastAgentError??early.stopReason);assert.equal(early.proposals.length,0);assert.equal(early.decisions.length,0);assert.equal(early.executions.length,0)
    console.log("PASS: live safe early arrival retained original booking without a human decision")
    if(!earlyOnly){
      let silent=await run("no_response");assert.equal(silent.state,"waiting",silent.lastAgentError??silent.stopReason);assert.equal(silent.driverReplies?.length??0,0)
      const persisted=await getIncident(silent.id);assert.equal(persisted?.state,"waiting")
      await commandIncidentService(silent.id,{command:"receive_driver_reply",terminalEta:"2026-10-21T10:00:00Z",safe:true,blockers:[],text:"Simulation: safely approaching terminal, ETA 10:00 UTC; no other blockers."})
      silent=await retryCommand(silent.id,{command:"run"});cases[cases.length-1]=silent;await save();assert.equal(silent.state,"resolved",silent.lastAgentError??silent.stopReason);assert.equal(silent.tasks.filter(t=>t.tool==="ask_driver").length,1)
      console.log("PASS: live silence -> persistent waiting -> explicit reply -> live resumed conclusion; no repeated driver question")
    }
    const after=await listIncidents();for(const [id,body] of original)assert.equal(JSON.stringify(after.find(i=>i.id===id)),body)
    assert.deepEqual(await toolsData.context("ord-00603"),orderBefore);await save()
    console.log(`PASS: ${original.size} previous incident histories and source order unchanged. Evidence: ${artifact}`)
    console.log(`URL: http://127.0.0.1:3001/incidents/${cases[0].id}`)
  } catch(error) { for(let n=0;n<cases.length;n++)cases[n]=(await getIncident(cases[n].id))??cases[n];await save();throw error }
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error instanceof Error?error.message:"Verification failed");process.exit(1)})
