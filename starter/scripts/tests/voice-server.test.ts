/** Real isolated PostgreSQL/API; ElevenLabs and business provider transport are local doubles. */
import {test} from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
const database=process.env.VOICE_TEST_DATABASE_URL
async function integration(){
 const u=new URL(database!);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'15440');assert.equal(u.pathname,'/controlroom_driver_voice');process.env.DATABASE_URL=database
 process.env.INCIDENT_OPERATOR_TOKEN='voice-local-test-operator';process.env.ELEVENLABS_API_KEY='voice-local-provider-double';process.env.ELEVENLABS_AGENT_ID='agent_local_test';process.env.ELEVENLABS_LIVE_ENABLED='false'
 let authorizations=0,fail=false,modelCalls=0
 globalThis.fetch=async(input,init)=>{
  const url=String(input)
  if(url.includes('elevenlabs.io')){authorizations++;assert.ok(url.includes('include_conversation_id=true'));assert.equal((init?.headers as any)['xi-api-key'],'voice-local-provider-double');if(fail)return Response.json({error:'test failure'},{status:503});return Response.json({signed_url:'wss://api.elevenlabs.io/v1/convai/conversation?conversation_signature=TEST_ONLY'})}
  assert.ok(url.startsWith('https://generativelanguage.googleapis.com/'),'No external provider transport allowed in tests');modelCalls++
  const body=JSON.parse(String(init?.body)),i=JSON.parse(body.contents[0].parts[0].text)
  const call=i.tasks.some((t:any)=>t.tool==='check_booking_constraints')?{tool:'close_disproved_alert',args:{reason:'Explicit confirmed simulated voice reply before recorded cutoff; no delivery conclusion'}}:{tool:'check_booking_constraints',args:{reservationId:'res-x0c658361818f4c47'}}
  return Response.json({responseId:'LOCAL_MODEL_DOUBLE',modelVersion:'local-double',candidates:[{content:{parts:[{text:JSON.stringify(call)}]}}]})
 }
 const store=await import('../../lib/incidents/store'),engine=await import('../../lib/incidents/engine'),voice=await import('../../lib/incidents/voice-store'),route=await import('../../app/api/incidents/[id]/voice/route')
 await store.initializeStore();await voice.initializeVoiceStore()
 const make=async()=>{const i=engine.createIncident('ord-00324','res-x0c658361818f4c47','no_response');i.demoRunId=randomUUID();i.workflow='ferry_delay';i.mode='llm';i.preferredProvider='gemini';await engine.useTool(i,{tool:'get_order_context',args:{}},store.toolsData);await engine.useTool(i,{tool:'ask_driver',args:{question:'Simulated driver: current terminal ETA, safety and blockers?'}},store.toolsData);assert.equal(i.state,'waiting');await store.insertIncident(i);return i}
 const i=await make(),original=await store.toolsData.context(i.orderId)
 const post=async(body:any,incident=i.id,authorized=true,origin='http://127.0.0.1:3110')=>{const r=await route.POST(new Request(`http://127.0.0.1:3110/api/incidents/${incident}/voice`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(authorized?{Authorization:'Bearer voice-local-test-operator'}:{})},body:JSON.stringify(body)}),{params:Promise.resolve({id:incident})});return {status:r.status,body:await r.json()}}
 const {issueSession,OPERATOR_COOKIE}=await import('../../lib/incidents/operator-session')
 const proxied=await route.GET(new Request(`http://localhost:3110/api/incidents/${i.id}/voice`,{headers:{Host:'127.0.0.1:3110',Origin:'http://127.0.0.1:3110',Cookie:`${OPERATOR_COOKIE}=${issueSession(process.env.INCIDENT_OPERATOR_TOKEN!)}`}}),{params:Promise.resolve({id:i.id})});assert.equal(proxied.status,200,'Same-origin cookie works when Next normalizes URL hostname')
 assert.equal((await post({action:'start'},i.id,false)).status,401);assert.equal((await post({action:'start'},i.id,true,'https://evil.invalid')).status,401)
 assert.equal((await post({action:'start'})).status,409);assert.equal(authorizations,0,'Disabled voice cannot call a provider')
 process.env.ELEVENLABS_LIVE_ENABLED='true';fail=true;assert.equal((await post({action:'start'})).status,503);assert.equal((await store.getIncident(i.id))!.state,'waiting');fail=false
 const first=await post({action:'start'});assert.equal(first.status,200);assert.equal(first.body.dynamicVariables.incident_id,i.id);assert.ok(first.body.dynamicVariables.incident_context.includes('ord-00324'));assert.ok(!JSON.stringify(first.body).includes('voice-local-provider-double'))
 const calls=authorizations;assert.equal((await post({action:'start'})).status,409);assert.equal(authorizations,calls,'Duplicate start must not mint another credential')
 const cancelled=(await post({action:'save',sessionId:first.body.session.id,version:1,status:'cancelled',transcript:[]})).body.session
 assert.equal((await post({action:'confirm',sessionId:cancelled.id,version:cancelled.version,reply:{}})).status,409)
 assert.equal((await store.getIncident(i.id))!.driverReplies?.length??0,0)
 const next=(await post({action:'start'})).body.session
 const agent={id:'agent:1',role:'agent',text:'This is simulated. What is your ETA?',at:new Date().toISOString()}
 const driver={id:'driver:2',role:'driver',text:'Terminal ETA is 12 UTC. I am safe. No blockers.',at:new Date().toISOString()}
 const saved=(await post({action:'save',sessionId:next.id,version:1,status:'active',conversationId:'conv_test_local',transcript:[agent,driver]})).body.session
 assert.equal((await post({action:'save',sessionId:next.id,version:saved.version,status:'active',transcript:[{...agent,text:'rewritten'},driver]})).status,409)
 assert.equal((await post({action:'confirm',sessionId:next.id,version:saved.version,reply:{}})).status,409,'Active voice cannot submit a driver reply')
 const ended=(await post({action:'save',sessionId:next.id,version:saved.version,status:'ended',conversationId:'conv_test_local',transcript:[agent,driver]})).body.session
 const reply={terminalEta:'2026-10-21T12:00:00Z',safe:true,blockers:[],text:driver.text}
 assert.equal((await post({action:'confirm',sessionId:next.id,version:1,reply})).status,409)
 const other=await make();assert.equal((await post({action:'confirm',sessionId:next.id,version:ended.version,reply},other.id)).status,409,'Cross-incident confirmation blocked')
 const confirmations=await Promise.all([post({action:'confirm',sessionId:next.id,version:ended.version,reply}),post({action:'confirm',sessionId:next.id,version:ended.version,reply})]);assert.ok(confirmations.every(r=>r.status===200),JSON.stringify(confirmations.map(r=>({status:r.status,error:r.body.error}))))
 let result=(await store.getIncident(i.id))!;assert.equal(result.driverReplies!.length,1);assert.equal(result.evidence.filter(e=>e.id===`voice:${next.id}`).length,1);assert.equal(result.timeline.filter(e=>e.type==='voice_reply_confirmed').length,1)
 assert.equal(result.proposals.length,0);assert.equal(result.decisions.length,0);assert.equal(result.executions.length,0);assert.equal(result.state,'investigating');assert.equal(modelCalls,0,'Confirmation must not call any business model')
 assert.equal((await post({action:'confirm',sessionId:next.id,version:ended.version,reply:{...reply,text:'conflicting'}})).status,409)
 const sessions=await voice.listVoiceSessions(i.id);assert.ok(sessions.some(s=>s.status==='error')&&sessions.some(s=>s.status==='cancelled')&&sessions.some(s=>s.status==='confirmed'))
 assert.ok(!JSON.stringify(sessions).includes('TEST_ONLY')&&!JSON.stringify(sessions).includes('voice-local-provider-double'))
 const finalized=sessions.find(s=>s.id===next.id)!;assert.equal(finalized.conversationId,'conv_test_local');assert.ok(finalized.sourceRefs.includes('res-x0c658361818f4c47'));assert.ok(finalized.confirmedAt&&finalized.transcript.every(t=>t.receivedAt))
 process.env.GEMINI_API_KEY='local-business-double';process.env.GEMINI_MODEL='gemini-3.5-flash-lite';process.env.GEMINI_ALLOWED_MODELS='gemini-3.5-flash-lite'
 const service=await import('../../lib/incidents/service');result=await service.commandIncidentService(i.id,{command:'run'})
 assert.equal(result.id,i.id);assert.equal(result.state,'resolved');assert.equal(result.tasks.filter(t=>t.tool==='ask_driver').length,1);assert.equal(result.executions.length,0)
 assert.deepEqual(await store.toolsData.context(i.orderId),original)
 console.log(JSON.stringify({passed:true,incidentId:i.id,voiceSessionId:next.id,voiceProvider:'MOCKED',businessProvider:'MOCKED',networkProviderCalls:0,confirmationAtomic:true,duplicateSafe:true,sameIncidentResumed:true,sessionsPersisted:sessions.length}))
}
if(process.argv.includes('--worker'))integration().then(()=>process.exit(0),e=>{console.error(e);process.exit(1)})
else test('voice API: auth, config, cancellation, failure, immutable transcript, confirmation, duplicate and same-incident resume',{skip:!database},async()=>{
 const {spawnSync}=await import('node:child_process');const r=spawnSync(process.execPath,['--import','tsx',process.argv[1],'--worker'],{env:process.env,encoding:'utf8',timeout:30000});assert.equal(r.error,undefined,r.error?.message);assert.equal(r.status,0,r.stdout+r.stderr);console.log(r.stdout)
})
