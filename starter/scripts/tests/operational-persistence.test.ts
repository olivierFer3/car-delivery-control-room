/** Real PostgreSQL + production API/service code; provider transport is a local test double. */
import assert from 'node:assert/strict'
import {test} from 'node:test'
import {spawnSync} from 'node:child_process'
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const isolated=process.env.OPERATIONAL_TEST_DATABASE_URL
async function phase(name:string,file:string){
 const url=new URL(isolated!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15438');assert.equal(url.pathname,'/controlroom_operational_test')
 process.env.DATABASE_URL=isolated;process.env.INCIDENT_OPERATOR_TOKEN='local-test-operator';process.env.GEMINI_API_KEY='local-test-only';process.env.GEMINI_MODEL='gemini-3.5-flash-lite';process.env.GEMINI_ALLOWED_MODELS='gemini-3.5-flash-lite'
 let calls=0,fail=false
 globalThis.fetch=async(input,init)=>{
  assert.ok(String(input).startsWith('https://generativelanguage.googleapis.com/'),'No external transport is used by this test');calls++
  if(fail)return Response.json({error:{code:'UNAVAILABLE'}},{status:503})
  const body=JSON.parse(String(init?.body)),i=JSON.parse(body.contents[0].parts[0].text),tasks=i.tasks as any[]
  let call:any
  if(body.systemInstruction.parts[0].text.startsWith('You explain'))call={tool:'answer_operator',args:{answer:'Test-double explanation cites the saved source; no decision was changed.',evidenceIds:[i.evidence[0].id]}}
  else if(!tasks.some(t=>t.tool==='get_order_context'))call={tool:'get_order_context',args:{}}
  else if(!tasks.some(t=>t.tool==='ask_driver'))call={tool:'ask_driver',args:{question:'Simulated driver, current ETA and safety?'}}
  else{
   const context=tasks.find(t=>t.tool==='get_order_context').result,r=context.reservations.find((r:any)=>r.kind==='FERRY'&&r.status==='BOOKED'),reply=i.driverReplies.at(-1)
   if(!tasks.some(t=>t.tool==='check_booking_constraints'))call={tool:'check_booking_constraints',args:{reservationId:r.id}}
   else if(Date.parse(reply.terminalEta)<=Date.parse(r.check_in_cutoff_at))call={tool:'close_disproved_alert',args:{reason:'Explicit safe simulated driver reply before the recorded cutoff; delivery not asserted'}}
   else if(!tasks.some(t=>t.tool==='search_travel_options'))call={tool:'search_travel_options',args:{}}
   else{
    const options=tasks.find(t=>t.tool==='search_travel_options').result,excluded=i.activeGoal.excludedOptionIds??[],o=options.find((o:any)=>o.data_origin==='SIMULATED_SERVICE'&&!excluded.includes(o.id))
    if(!tasks.some(t=>t.tool==='check_option_constraints'&&t.args.optionId===o.id))call={tool:'check_option_constraints',args:{optionId:o.id}}
    else call={tool:'create_proposal',args:{optionId:o.id,reservationId:r.id,summary:'Test-double fictional alternative',consequences:'Simulated quote only; original delivery promise unchanged',evidenceIds:[o.id,r.id,reply.id]}}
   }
  }
  return Response.json({responseId:'test-double-'+calls,modelVersion:'local-test-double',candidates:[{content:{parts:[{text:JSON.stringify(call)}]}}]})
 }
 const collection=await import('../../app/api/incidents/route'),detail=await import('../../app/api/incidents/[id]/route')
 const store=await import('../../lib/incidents/store');await store.initializeStore()
 const post=async(body:any,token=true)=>{const r=await collection.POST(new Request('http://localhost/api/incidents',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer local-test-operator'}:{})},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()}}
 const command=async(id:string,body:any)=>{const r=await detail.POST(new Request('http://localhost/api/incidents/'+id,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer local-test-operator'},body:JSON.stringify(body)}),{params:Promise.resolve({id})});return {status:r.status,body:await r.json()}}
 const catalog=await store.operationalOrders()
 if(name==='wait'){
  assert.equal(catalog.length,100);assert.equal(catalog.filter(o=>o.signals.some(s=>s.supported)).length,6)
  const ids=[]
  for(const orderId of ['ord-00075','ord-00324']){
   const source=catalog.find(o=>o.id===orderId)!.signals.find(s=>s.supported)!
   const payload={workflow:'operational',mode:'llm',orderId,signalId:source.id,provider:'gemini'}
   assert.equal((await post(payload,false)).status,401)
   if(!ids.length){delete process.env.GEMINI_API_KEY;const missing=await post(payload);assert.equal(missing.status,400);assert.match(missing.body.error,/credentials/);process.env.GEMINI_API_KEY='local-test-only'}
   const created=await post(payload);assert.equal(created.status,201);const i=created.body
   assert.equal(i.orderId,orderId);assert.equal(i.signalId,source.id);assert.equal((await post(payload)).body.id,i.id)
   assert.equal((await post({...payload,signalId:'foreign-source'})).status,400)
   if(!ids.length){fail=true;const failure=await command(i.id,{command:'run'});assert.equal(failure.body.state,'technical_error');assert.equal(failure.body.proposals.length,0);fail=false}
   const waiting=await command(i.id,{command:'run'});assert.equal(waiting.body.state,'waiting');assert.equal(waiting.body.tasks.filter((t:any)=>t.tool==='ask_driver').length,1)
   assert.equal(waiting.body.driverReplies?.length??0,0);assert.equal(waiting.body.activeRun,undefined)
   ids.push({id:i.id,orderId,sourceId:source.id,context:await store.toolsData.context(orderId)})
  }
  const unsupported=catalog.find(o=>o.id==='ord-00020')!,handoff=await post({workflow:'operational',orderId:unsupported.id,signalId:unsupported.signals[0].id,provider:'gemini'})
  assert.equal(handoff.body.workflow,'human_review');assert.equal(handoff.body.state,'waiting');assert.equal((await command(handoff.body.id,{command:'run'})).status,409)
  writeFileSync(file,JSON.stringify({ids,handoff:handoff.body.id}));console.log(JSON.stringify({phase:name,provider:'LOCAL TEST DOUBLE',calls,networkRequests:0,ids:ids.map(i=>i.id)}))
 }else{
  const {ids}=JSON.parse(readFileSync(file,'utf8'))
  for(const [n,entry] of ids.entries()){
   const old=(await store.getIncident(entry.id))!;assert.equal(old.state,'waiting');const before=calls
   await command(entry.id,{command:'run'});assert.equal(calls,before,'Restart without reply must not use a provider')
   const reservation=entry.context.reservations.find((r:any)=>r.kind==='FERRY'&&r.status==='BOOKED'),cutoff=Date.parse(reservation.check_in_cutoff_at)
   const reply={command:'receive_driver_reply',terminalEta:new Date(cutoff+(n===0?-3600000:3600000)).toISOString(),safe:true,blockers:[],text:'Explicit fictional test event; safety confirmed'}
   await command(entry.id,reply);await command(entry.id,reply)
   let result=(await command(entry.id,{command:'run'})).body
   assert.equal(result.id,entry.id);assert.equal(result.tasks.filter((t:any)=>t.tool==='ask_driver').length,1)
   assert.equal(result.driverReplies.length,1);assert.deepEqual(result.tasks.slice(0,old.tasks.length),old.tasks)
   if(n===0){assert.equal(result.state,'resolved');assert.equal(result.proposals.length,0)}else{
    assert.equal(result.state,'needs_decision');assert.equal(result.proposals[0].actions[0].reservationId,reservation.id)
    assert.equal((await command(entry.id,{command:'execute',version:1})).status,409)
    const explained=await command(entry.id,{command:'message',text:'Why this option?'});assert.deepEqual(explained.body.proposals,result.proposals);assert.equal(explained.body.conversation.length,2)
    await command(entry.id,{command:'decide',choice:'reject',version:1,operator:'test',comment:'Too expensive'});assert.equal((await store.getIncident(entry.id))!.state,'waiting')
    await command(entry.id,{command:'decide',choice:'alternative',version:1,operator:'test',comment:'Find another departure'})
    result=(await command(entry.id,{command:'run'})).body;assert.equal(result.state,'needs_decision');assert.equal(result.proposals.at(-1).version,2)
    assert.notEqual(result.proposals[0].actions[0].optionId,result.proposals[1].actions[0].optionId)
    assert.equal((await command(entry.id,{command:'decide',choice:'approve',version:1,operator:'test',comment:'stale'})).status,409)
    const approved=(await command(entry.id,{command:'decide',choice:'approve',version:2,operator:'test',comment:'Reviewed exact version'})).body;assert.equal(approved.state,'approved');assert.equal(approved.executions.length,0)
    const receipts=await Promise.all([command(entry.id,{command:'execute',version:2}),command(entry.id,{command:'execute',version:2})]);assert.ok(receipts.every(r=>r.status===200&&r.body.executions.length===1))
   }
   assert.deepEqual(await store.toolsData.context(entry.orderId),entry.context,'Source snapshot must not change')
  }
  console.log(JSON.stringify({phase:name,provider:'LOCAL TEST DOUBLE',calls,networkRequests:0,persistedAcrossProcesses:true,approvalVersioningAndDuplicateExecution:true}))
 }
}
if(process.argv.includes('--phase')){const at=process.argv.indexOf('--phase');phase(process.argv[at+1],process.argv[at+2]).then(()=>process.exit(0),e=>{console.error(e);process.exit(1)})}
else test('normal selected-order API persists across processes; recovers failures, waits, revises, approves and executes once',{skip:!isolated},()=>{
 const file=join(mkdtempSync(join(tmpdir(),'controlroom-operational-')),'cases.json')
 for(const p of ['wait','resume']){const child=spawnSync(process.execPath,['--import','tsx',process.argv[1],'--phase',p,file],{env:process.env,encoding:'utf8',timeout:30000});assert.equal(child.error,undefined,child.error?.message);assert.equal(child.status,0,child.stdout+child.stderr);console.log(child.stdout.trim())}
})
