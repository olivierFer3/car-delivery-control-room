import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createIncident, runAgent, useTool, receiveDriverReply, decide, executeApproved, type Context, type ToolsData } from '../../lib/incidents/engine'
import type { Incident, Provider, ToolCall, Command } from '../../lib/incidents/contracts'

const context: Context={order:{id:'order'},alerts:[{id:'signal',status:'OPEN'}],messages:[],reservations:[{id:'reservation',kind:'FERRY',status:'BOOKED',assignment_id:'driver',check_in_cutoff_at:'2026-10-21T12:00:00Z'}],options:[{id:'option',kind:'FERRY',assignment_id:'driver',status:'AVAILABLE_QUOTE',check_in_cutoff_at:'2026-10-22T12:00:00Z',departure_at:'2026-10-22T14:00:00Z',arrival_at:'2026-10-23T14:00:00Z',quote_cents:20000,currency:'EUR'}]}
const data: ToolsData={context:async()=>structuredClone(context),similar:async()=>[]}
const read: ToolCall={tool:'get_order_context',args:{}}
const ask: ToolCall={tool:'ask_driver',args:{question:'Current terminal ETA and safety?'}}
const search: ToolCall={tool:'search_travel_options',args:{}}
const check: ToolCall={tool:'check_booking_constraints',args:{reservationId:'reservation'}}
const close: ToolCall={tool:'close_disproved_alert',args:{reason:'Explicit safe driver reply meets the original cutoff'}}
const reply: Extract<Command,{command:'receive_driver_reply'}>={command:'receive_driver_reply',terminalEta:'2026-10-21T10:00:00Z',safe:true,blockers:[],text:'Explicit simulated reply: safe, ETA 10:00 UTC'}
function incident(){const i=createIncident('order','signal','no_response');i.mode='llm';return i}
function scripted(steps:ToolCall[]){
 let calls=0
 const provider:Provider={name:'fixture',model:'deterministic',choose:async()=>{calls++;const next=steps.shift();assert.ok(next,'No extra model call is allowed');return next}}
 return {provider,calls:()=>calls}
}
async function waiting(){const i=incident();const p=scripted([read,ask]);await runAgent(i,data,[p.provider]);assert.equal(i.state,'waiting');return i}

async function databasePhase(phase:string,id?:string){
 const url=new URL(process.env.OVERNIGHT_TEST_DATABASE_URL??'')
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15438');assert.equal(url.pathname,'/controlroom_overnight_validation');assert.equal(url.username,'overnight')
 process.env.DATABASE_URL=url.toString()
 process.env.GEMINI_API_KEY='deterministic-test-only';process.env.GEMINI_MODEL='gemini-3.5-flash-lite';process.env.GEMINI_ALLOWED_MODELS='gemini-3.5-flash-lite'
 let calls=0
 // Entirely local HTTP double: no original fetch or real provider is called.
 globalThis.fetch=async()=>{
  calls++;assert.ok(calls<=6,'Repeated model-call loop')
  const persisted=currentView
  let call:ToolCall
  if(!persisted.tasks.some(t=>t.tool==='get_order_context'))call=read
  else if(!persisted.tasks.some(t=>t.tool==='ask_driver'))call=ask
  else if(!persisted.driverReplies?.length)call=ask // Captured failure pattern must never be reached.
  else if(!persisted.tasks.some(t=>t.tool==='check_booking_constraints'&&(t.result as {driverEvidenceId?:string}).driverEvidenceId===persisted.driverReplies!.at(-1)!.id))call={tool:'check_booking_constraints',args:{reservationId:'res-x1082202e8d139d61'}}
  else call=close
  return Response.json({responseId:'fixture-'+calls,modelVersion:'deterministic',candidates:[{content:{parts:[{text:JSON.stringify(call)}]}}]})
 }
 let currentView:Incident
 const response=globalThis.fetch
 globalThis.fetch=async(input,init)=>{
  const body=JSON.parse(String(init?.body));currentView=JSON.parse(body.contents[0].parts[0].text)
  return response(input,init)
 }
 const {createLiveIncident,commandIncidentService}=await import('../../lib/incidents/service')
 const {getIncident}=await import('../../lib/incidents/store')
 if(phase==='wait'){
  const i=await createLiveIncident('no_response','gemini')
  await commandIncidentService(i.id,{command:'run'})
  const persisted=(await getIncident(i.id))!
  assert.equal(persisted.state,'waiting');assert.equal(calls,2);assert.equal(persisted.driverReplies?.length??0,0);assert.ok(!persisted.activeRun)
  console.log(JSON.stringify({id:i.id,history:persisted.tasks,modelTurns:persisted.modelTurns?.length,calls}))
 }else{
  assert.ok(id)
  const persisted=(await getIncident(id))!;assert.equal(persisted.state,'waiting')
  const history=structuredClone(persisted.tasks)
  await commandIncidentService(id,{command:'run'});assert.equal(calls,0,'Restart/resume without new information must not call a model')
  assert.deepEqual((await getIncident(id))!.tasks,history)
  await Promise.all([commandIncidentService(id,reply),commandIncidentService(id,reply)])
  const received=(await getIncident(id))!;assert.equal(received.driverReplies!.length,1);assert.equal(received.tasks.filter(t=>t.tool==='receive_driver_reply').length,1)
  await assert.rejects(()=>commandIncidentService(id,{...reply,terminalEta:'2026-10-21T11:00:00Z'}),/already received|conflict/)
  const resumed=await commandIncidentService(id,{command:'run'})
  assert.equal(resumed.id,id);assert.equal(resumed.state,'resolved');assert.equal(calls,2)
  assert.deepEqual(resumed.tasks.slice(0,history.length),history)
  assert.equal(resumed.tasks.filter(t=>t.tool==='ask_driver').length,1);assert.equal(resumed.timeline.filter(t=>t.type==='driver_reply').length,1)
  assert.equal(resumed.executions.length,0);assert.equal(resumed.proposals.length,0)
  const savedResolved=(await getIncident(id))!
  assert.deepEqual(await commandIncidentService(id,reply),savedResolved,'Duplicate after completion must not reopen or mutate persisted history')
  console.log(JSON.stringify({id,state:resumed.state,historyPreserved:true,outreach:1,replies:1,calls}))
 }
}
if(process.argv.includes('--db-phase')){
 const at=process.argv.indexOf('--db-phase')
 databasePhase(process.argv[at+1],process.argv[at+2]).then(()=>process.exit(0),error=>{console.error(error);process.exit(1)})
}else{
 test('no response checkpoints waiting immediately and preserves independent checks without another model call',async()=>{
  const i=incident(),p=scripted([read,search,ask]);const saved:Incident[]=[]
  await runAgent(i,data,[p.provider],async()=>{saved.push(structuredClone(i))})
  assert.equal(i.state,'waiting');assert.equal(p.calls(),3);assert.equal(i.lastAgentError,undefined)
  assert.equal(saved.at(-1)!.state,'waiting');assert.deepEqual(i.tasks.map(t=>t.tool),['get_order_context','search_travel_options','ask_driver'])
  assert.ok(i.missing.includes('Current driver reply'));assert.equal(i.driverReplies?.length??0,0)
  assert.equal((i.tasks.at(-1)!.result as {terminalEta?:string}).terminalEta,undefined)
  assert.equal(i.proposals.length,0);assert.equal(i.executions.length,0)
 })
 test('cached no-response and repeated run/ask stay waiting without more outreach or model calls',async()=>{
  const i=incident();await useTool(i,read,data);await useTool(i,ask,data)
  i.state='technical_error' // Legacy failure/recovery with a persisted no-response result.
  const p=scripted([]);await runAgent(i,data,[p.provider]);assert.equal(i.state,'waiting');assert.equal(p.calls(),0)
  const result=await useTool(i,ask,data);assert.deepEqual(result,i.tasks.at(-1)!.result)
  const before=JSON.stringify(i);await runAgent(i,data,[]);assert.equal(JSON.stringify(i),before)
  assert.equal(i.tasks.filter(t=>t.tool==='ask_driver').length,1);assert.equal(i.evidence.filter(e=>e.source==='simulated_driver').length,1)
 })
 test('new reply resumes the same incident once; identical retries are no-ops and conflicting retries fail',async()=>{
  const i=await waiting(),id=i.id,history=structuredClone(i.tasks)
  receiveDriverReply(i,reply);const received=JSON.stringify(i);receiveDriverReply(i,{...reply,blockers:[]});assert.equal(JSON.stringify(i),received)
  assert.throws(()=>receiveDriverReply(i,{...reply,safe:false}),/already received|conflict/)
  const p=scripted([check,close]);await runAgent(i,data,[p.provider])
  assert.equal(i.id,id);assert.equal(i.state,'resolved');assert.equal(p.calls(),2);assert.deepEqual(i.tasks.slice(0,history.length),history)
  const resolved=JSON.stringify(i);receiveDriverReply(i,reply);assert.equal(JSON.stringify(i),resolved)
  assert.equal(i.tasks.filter(t=>t.tool==='receive_driver_reply').length,1);assert.equal(i.timeline.filter(t=>t.type==='driver_reply').length,1)
  assert.equal(i.executions.length,0)
 })
 test('late reply still requires current evidence and version-specific human approval before any effect',async()=>{
  const i=await waiting(),late={...reply,terminalEta:'2026-10-21T13:00:00Z'};receiveDriverReply(i,late)
  await useTool(i,check,data);await useTool(i,search,data);await useTool(i,{tool:'check_option_constraints',args:{optionId:'option'}},data)
  await useTool(i,{tool:'create_proposal',args:{optionId:'option',reservationId:'reservation',summary:'Fictional later ferry',consequences:'Quote only; customer promise unchanged',evidenceIds:['reservation','option',i.driverReplies![0].id]}},data)
  assert.throws(()=>executeApproved(i,1),/approval/);assert.throws(()=>decide(i,{command:'decide',version:2,choice:'approve',operator:'test',comment:''}),/Stale/)
  decide(i,{command:'decide',version:1,choice:'approve',operator:'test',comment:'Exact version'});assert.equal(i.executions.length,0);executeApproved(i,1)
  const final=JSON.stringify(i);receiveDriverReply(i,late);assert.equal(JSON.stringify(i),final);executeApproved(i,1);assert.equal(i.executions.length,1)
 })
 test('waiting survives actual process restart in isolated Postgres; duplicate reply events are serialized', {skip:!process.env.OVERNIGHT_TEST_DATABASE_URL},()=>{
  const worker=(phase:string,id?:string)=>{
   const child=spawnSync(process.execPath,['--import','tsx',process.argv[1],'--db-phase',phase,...(id?[id]:[])],{env:process.env,encoding:'utf8',timeout:20000})
   assert.equal(child.error,undefined);assert.equal(child.status,0,child.stdout+child.stderr)
   return JSON.parse(child.stdout.trim())
  }
  const before=worker('wait'),after=worker('resume',before.id)
  assert.equal(before.id,after.id);assert.equal(before.calls+after.calls,4);assert.equal(after.state,'resolved')
 })
}
