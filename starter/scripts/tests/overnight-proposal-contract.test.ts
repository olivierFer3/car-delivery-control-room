import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GeminiProvider } from '../../lib/incidents/providers'
import { createIncident, useTool, executeApproved, type Context, type ToolsData } from '../../lib/incidents/engine'
import type { ToolCall } from '../../lib/incidents/contracts'

const captured: ToolCall = {tool:'create_proposal',args:{reason:'',optionId:'sim-ferry-603-1',contradictions:[]}}
const fields=['optionId','reservationId','summary','consequences','evidenceIds']
const context: Context={order:{id:'order'},alerts:[{id:'signal',status:'OPEN'}],messages:[],reservations:[{id:'reservation',kind:'FERRY',status:'BOOKED',assignment_id:'driver',check_in_cutoff_at:'2026-10-21T12:00:00Z'}],options:[{id:'sim-ferry-603-1',kind:'FERRY',assignment_id:'driver',status:'AVAILABLE_QUOTE',check_in_cutoff_at:'2026-10-22T12:00:00Z',departure_at:'2026-10-22T14:00:00Z',arrival_at:'2026-10-23T14:00:00Z',quote_cents:20000,currency:'EUR'}]}
const data: ToolsData={context:async()=>structuredClone(context),similar:async()=>[]}
async function prepared(){
 const i=createIncident('order','signal','delay');i.mode='llm'
 for(const call of [{tool:'get_order_context',args:{}},{tool:'ask_driver',args:{question:'Current ETA and safety?'}},{tool:'check_booking_constraints',args:{reservationId:'reservation'}},{tool:'search_travel_options',args:{}},{tool:'check_option_constraints',args:{optionId:'sim-ferry-603-1'}}])await useTool(i,call,data)
 return i
}
async function mockGemini(call: ToolCall, inspect: (schema:any)=>void){
 const original=globalThis.fetch
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));inspect(body.generationConfig.responseJsonSchema)
  return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(call)}]}}]})
 }
 try{return await new GeminiProvider('gemini-3.5-flash-lite','test-only').choose(createIncident('order','signal','delay'),AbortSignal.timeout(1000))}
 finally{globalThis.fetch=original}
}
test('Gemini proposal branch requires exactly the engine arguments, excluding the captured invalid shape',async()=>{
 await mockGemini(captured,schema=>{
  const proposal=schema.anyOf?.find((branch:any)=>branch.properties.tool.enum.includes('create_proposal'))
  assert.ok(proposal,'Proposal needs a tool-specific schema branch')
  assert.deepEqual(proposal.properties.tool.enum,['create_proposal'])
  assert.deepEqual(proposal.required,['tool','args']);assert.equal(proposal.additionalProperties,false)
  const args=proposal.properties.args
  assert.deepEqual(args.required,fields);assert.deepEqual(Object.keys(args.properties),fields)
  assert.equal(args.additionalProperties,false)
  for(const key of fields.slice(0,4))assert.deepEqual(args.properties[key],{type:'string',minLength:1,maxLength:4000})
  assert.deepEqual(args.properties.evidenceIds,{type:'array',maxItems:30,items:{type:'string',maxLength:4000}})
  for(const branch of schema.anyOf)if(branch!==proposal)assert.ok(!branch.properties.tool.enum.includes('create_proposal'),'No broader branch may admit the failed response')
 })
})
test('captured malformed response is preserved and rejected server-side without proposal or execution',async()=>{
 const i=await prepared();const call=await mockGemini(captured,()=>{})
 assert.deepEqual({tool:call.tool,args:call.args},captured)
 await assert.rejects(()=>useTool(i,call,data),/Unexpected tool argument/)
 assert.equal(i.proposals.length,0);assert.equal(i.executions.length,0)
})
test('valid provider proposal matches the engine contract; missing or extra fields still fail',async()=>{
 const i=await prepared()
 const args={optionId:'sim-ferry-603-1',reservationId:'reservation',summary:'Review fictional later ferry',consequences:'Fictional quote; customer promise unchanged',evidenceIds:['reservation','sim-ferry-603-1',i.driverReplies!.at(-1)!.id]}
 for(const field of fields){const missing:Record<string,unknown>={...args};delete missing[field];await assert.rejects(()=>useTool(i,{tool:'create_proposal',args:missing},data));assert.equal(i.proposals.length,0)}
 await assert.rejects(()=>useTool(i,{tool:'create_proposal',args:{...args,reason:'do not discard'}},data),/Unexpected tool argument/)
 const call=await mockGemini({tool:'create_proposal',args},()=>{})
 await useTool(i,call,data);assert.equal(i.state,'needs_decision');assert.equal(i.proposals.length,1)
 assert.deepEqual(i.proposals[0].evidenceIds,args.evidenceIds);assert.equal(i.proposals[0].actions[0].costCents,20000)
 assert.equal(i.executions.length,0);assert.throws(()=>executeApproved(i,1),/approval/)
})
