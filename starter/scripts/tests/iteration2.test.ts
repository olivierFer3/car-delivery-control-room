import { test } from "node:test"
import assert from "node:assert/strict"
import { createIncident, runAgent, explainIncident, receiveDriverReply, decide, executeApproved, type Context, type ToolsData } from "../../lib/incidents/engine"
import { GroqProvider, GeminiProvider, configuredProviders } from "../../lib/incidents/providers"
import type { Incident, Provider, ToolCall } from "../../lib/incidents/contracts"
const context: Context={order:{id:"order"},alerts:[{id:"signal",status:"OPEN"}],messages:[],reservations:[{id:"reservation",kind:"FERRY",status:"BOOKED",assignment_id:"driver",check_in_cutoff_at:"2026-10-21T12:00:00Z"}],options:[1,2].map(n=>({id:`option${n}`,kind:"FERRY",assignment_id:"driver",status:"AVAILABLE_QUOTE",check_in_cutoff_at:`2026-10-${21+n}T12:00:00Z`,departure_at:`2026-10-${21+n}T14:00:00Z`,arrival_at:`2026-10-${22+n}T14:00:00Z`,quote_cents:n*20000,currency:"EUR"}))}
const data:ToolsData={context:async()=>structuredClone(context),similar:async()=>[]}
function incident(scenario:Incident["scenario"]="delay"){const i=createIncident("order","signal",scenario);i.mode="llm";return i}
/** Test double only: production chooses via a configured provider, never this function. */
function scripted(steps:(ToolCall|((i:Incident)=>ToolCall))[]):Provider{return {name:"test-double",model:"automated-test",choose:async i=>{const step=steps.shift();assert.ok(step,"Unexpected extra model call");return typeof step==="function"?step(i):step}}}
const read:ToolCall={tool:"get_order_context",args:{}}, ask:ToolCall={tool:"ask_driver",args:{question:"Terminal ETA, safety and any blockers?"}}, check:ToolCall={tool:"check_booking_constraints",args:{reservationId:"reservation"}}
const alternative=(n:number):((i:Incident)=>ToolCall)=>(i)=>({tool:"create_proposal",args:{optionId:`option${n}`,reservationId:"reservation",summary:"Review a fictional later ferry",consequences:"Fictional quote; customer promise unchanged",evidenceIds:["reservation",`option${n}`,i.driverReplies!.at(-1)!.id]}})
function lateSteps(n=1){return [read,ask,check,{tool:"search_travel_options",args:{}},{tool:"check_option_constraints",args:{optionId:`option${n}`}},alternative(n)]}
test("late arrival produces evidence-backed proposal, checkpoints choices/results, approval and one execution",async()=>{
 const i=incident();const checkpoints:string[]=[];await runAgent(i,data,[scripted(lateSteps())],async()=>{checkpoints.push(JSON.stringify(i))})
 assert.equal(i.state,"needs_decision");assert.equal(i.executions.length,0);assert.equal(i.modelTurns?.length,6);assert.ok(checkpoints.length>=12);assert.ok(i.modelTurns?.every(t=>t.selected&&t.result));assert.match(i.stopReason!,/approval/)
 assert.throws(()=>executeApproved(i,1),/approval/);decide(i,{command:"decide",version:1,choice:"approve",operator:"test",comment:"Exact version"});executeApproved(i,1);executeApproved(i,1);assert.equal(i.executions.length,1)
})
test("safe early arrival checks original booking and retains it without a human decision",async()=>{
 const i=incident("disproved");await runAgent(i,data,[scripted([read,ask,check,{tool:"close_disproved_alert",args:{reason:"Driver safe, no blockers; ETA 10:00 precedes cutoff 12:00; retain reservation"}}])]);assert.equal(i.state,"resolved");assert.equal(i.proposals.length,0);assert.equal(i.decisions.length,0);assert.equal(i.executions.length,0);assert.match(i.stopReason!,/retain/)
})
test("silent driver waits, survives serialization, resumes from explicit reply without repeating outreach",async()=>{
 let i=incident("no_response");await runAgent(i,data,[scripted([read,ask,{tool:"wait",args:{reason:"Await driver",missing:["Current driver reply"],contradictions:[]}}])]);assert.equal(i.state,"waiting");assert.equal(i.driverReplies?.length??0,0)
 i=JSON.parse(JSON.stringify(i));receiveDriverReply(i,{command:"receive_driver_reply",terminalEta:"2026-10-21T10:00:00Z",safe:true,blockers:[],text:"Simulation: safe, ETA 10:00"});await runAgent(i,data,[scripted([check,{tool:"close_disproved_alert",args:{reason:"New driver reply meets cutoff; retain booking"}}])]);assert.equal(i.state,"resolved");assert.equal(i.tasks.filter(t=>t.tool==="ask_driver").length,1);assert.equal(i.tasks.filter(t=>t.tool==="receive_driver_reply").length,1)
})
test("an early ETA with unconfirmed safety cannot silently close the risk",async()=>{
 const i=incident("no_response");i.state="waiting";i.tasks.push({tool:"ask_driver",args:{},result:{status:"no_response"},at:i.simulationTime});receiveDriverReply(i,{command:"receive_driver_reply",terminalEta:"2026-10-21T10:00:00Z",safe:false,blockers:[],text:"Safety unknown"});await runAgent(i,data,[scripted([check,{tool:"close_disproved_alert",args:{reason:"Looks early"}},{tool:"wait",args:{reason:"Safety missing",missing:["Safety confirmation"],contradictions:[]}}])]);assert.equal(i.state,"waiting");assert.ok(i.tasks.some(t=>(t.result as {error?:string})?.error))
})
test("why conversation is read-only, alternative creates new version and old approval cannot execute",async()=>{
 const i=incident();await runAgent(i,data,[scripted(lateSteps())]);const before=JSON.stringify(i.proposals);await explainIncident(i,"Why this option?",[scripted([{tool:"answer_operator",args:{answer:"Reported ETA misses reservation cutoff. This is a fictional quote.",evidenceIds:["reservation"]}}])]);assert.equal(JSON.stringify(i.proposals),before);assert.equal(i.state,"needs_decision");assert.equal(i.conversation.length,2)
 decide(i,{command:"decide",version:1,choice:"alternative",operator:"test",comment:"Cheaper option"});await runAgent(i,data,[scripted([{tool:"check_option_constraints",args:{optionId:"option2"}},alternative(2)])]);assert.equal(i.proposals.at(-1)?.version,2);assert.throws(()=>executeApproved(i,1),/Stale/);assert.throws(()=>executeApproved(i,2),/approval/)
})
test("failed explanation does not invalidate the pending proposal or synthesize an answer",async()=>{
 const i=incident();await runAgent(i,data,[scripted(lateSteps())]);await explainIncident(i,"Why?",[{name:"failed",model:"test",choose:async()=>{throw new Error("down")}}]);assert.equal(i.state,"needs_decision");assert.equal(i.conversation.length,1);assert.ok(i.lastAgentError)
})
test("Groq and Gemini share JSON tool contract and exclude simulation scenario from model input",async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async(url,init)=>{calls++;const body=JSON.parse(String(init?.body));assert.doesNotMatch(JSON.stringify(body),/"scenario"/);if(String(url).includes("groq")){assert.equal(body.response_format.type,"json_schema");assert.equal(body.tools,undefined);return Response.json({id:"live-shaped-test-id",model:"openai/gpt-oss-20b",choices:[{message:{content:JSON.stringify(read)}}]})}return Response.json({responseId:"gemini-test-id",modelVersion:"gemini-2.5-flash",candidates:[{content:{parts:[{text:JSON.stringify(read)}]}}]})}
 try{for(const p of [new GroqProvider("openai/gpt-oss-20b","test-secret"),new GeminiProvider("gemini-2.5-flash","test-secret")]){const result=await p.choose(incident(),AbortSignal.timeout(1000));assert.equal(result.tool,"get_order_context");assert.ok(result.metadata?.responseId)}assert.equal(calls,2)}finally{globalThis.fetch=original}
})
test("missing credentials fail closed for both Groq and Gemini",()=>{const keys=["GROQ_API_KEY","GEMINI_API_KEY"];const prior=keys.map(k=>process.env[k]);try{for(const k of keys)delete process.env[k];assert.deepEqual(configuredProviders("groq",false),[]);assert.deepEqual(configuredProviders("gemini",false),[])}finally{keys.forEach((k,n)=>{if(prior[n]===undefined)delete process.env[k];else process.env[k]=prior[n]})}})

test("alternative request remains actionable after waiting and requires a new proposal instead of waiting for approval",async()=>{
 const i=incident();await runAgent(i,data,[scripted(lateSteps())]);decide(i,{command:"decide",version:1,choice:"alternative",operator:"test",comment:"Different sailing"});i.state="waiting";decide(i,{command:"decide",version:1,choice:"alternative",operator:"test",comment:"Another option, even if dearer"});
 await runAgent(i,data,[scripted([{tool:"wait",args:{reason:"Awaiting approval",missing:["Human approval"],contradictions:[]}},{tool:"check_option_constraints",args:{optionId:"option2"}},alternative(2)])]);assert.equal(i.state,"needs_decision");assert.equal(i.proposals.at(-1)?.version,2)
})

test("provider sees failed tool feedback while preparing an alternative",async()=>{
 const i=incident();await runAgent(i,data,[scripted(lateSteps())]);decide(i,{command:"decide",version:1,choice:"alternative",operator:"test",comment:"Different option"});i.tasks.push({tool:"create_proposal",args:{optionId:"option1"},result:{error:"Select a different option after rejection or alternative request"},at:i.simulationTime})
 const original=globalThis.fetch;globalThis.fetch=async(_url,init)=>{const body=JSON.parse(String(init?.body)),view=JSON.parse(body.messages[1].content);assert.equal(view.activeGoal.type,"prepare_a_new_alternative");assert.ok(view.tasks.some((t:{result:{error?:string}})=>t.result?.error?.includes("different option")));return Response.json({choices:[{message:{content:JSON.stringify({tool:"check_option_constraints",args:{optionId:"option2"}})}}]})}
 try{await new GroqProvider("openai/gpt-oss-20b","test-only").choose(i,AbortSignal.timeout(1000),"investigate")}finally{globalThis.fetch=original}
})
