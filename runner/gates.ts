/** Development gates. Model reasoning is mocked; DB/HTTP are real and isolated. */
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const postgres=createRequire(process.cwd()+'/package.json')('postgres')
import { createIncident, decide, executeApproved, runAgent, useTool } from '../starter/lib/incidents/engine'
import { initializeStore, insertIncident, getIncident, mutateIncident, saveAgentCheckpoint, toolsData } from '../starter/lib/incidents/store'
const gate=process.argv[2]??'iteration2'
const url=new URL(process.env.DATABASE_URL??'')
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'15438');assert.equal(url.pathname,'/controlroom_overnight_validation');assert.equal(url.username,'overnight')
const base=process.env.APP_URL;assert.equal(base,'http://127.0.0.1:3107')
async function main(){
 await initializeStore()
 const original=await toolsData.context('ord-00603');assert.ok(original)
 const i=createIncident('ord-00603','alert-x5259ff7f2e03f0e6','delay');i.demoRunId=i.id
 await useTool(i,{tool:'get_order_context',args:{}},toolsData);await useTool(i,{tool:'ask_driver',args:{question:'Simulated ETA and safety?'}},toolsData);await useTool(i,{tool:'search_travel_options',args:{}},toolsData)
 await useTool(i,{tool:'check_option_constraints',args:{optionId:'sim-ferry-603-1'}},toolsData)
 await useTool(i,{tool:'create_proposal',args:{optionId:'sim-ferry-603-1',reservationId:'res-x1082202e8d139d61',summary:'Mocked-model integration check',consequences:'Fictional booking only',evidenceIds:['sim-ferry-603-1','res-x1082202e8d139d61',`driver:${i.id}`]}},toolsData)
 await insertIncident(i)
 await assert.rejects(()=>mutateIncident(i.id,async row=>{executeApproved(row,1)}),/approval/)
 await mutateIncident(i.id,async row=>{decide(row,{command:'decide',choice:'approve',version:1,operator:'isolated-test',comment:'Fictional test approval'})})
 const results=await Promise.all([mutateIncident(i.id,async row=>{executeApproved(row,1)}),mutateIncident(i.id,async row=>{executeApproved(row,1)})]);assert.ok(results.every(r=>r.executions.length===1));assert.equal((await getIncident(i.id))!.executions.length,1)
 const lease=createIncident('ord-00603','alert-x5259ff7f2e03f0e6','no_response');lease.demoRunId=lease.id;lease.mode='llm';lease.activeRun={id:'current-owner',expiresAt:new Date(Date.now()+30000).toISOString()};await insertIncident(lease)
 await assert.rejects(()=>mutateIncident(lease.id,async()=>{}),/already running/)
 await assert.rejects(()=>saveAgentCheckpoint({...lease,summary:'stale worker'},'expired-owner'),/expired|replaced/)
 assert.notEqual((await getIncident(lease.id))!.summary,'stale worker')
 const request=await fetch(base+'/api/incidents/'+i.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command:'execute',version:1})});assert.equal(request.status,401)
 const publicRows=await fetch(base+'/api/incidents');assert.equal(publicRows.status,200)
 assert.deepEqual(await toolsData.context('ord-00603'),original)
 if(gate==='iteration3'){
  // A competing transaction must not leave the product read waiting without a bound.
  const q=postgres(process.env.DATABASE_URL!,{max:1})
  let release!:()=>void,locked!:()=>void
  const acquired=new Promise<void>(r=>{locked=r}),finish=new Promise<void>(r=>{release=r})
  const blocker=q.begin(async (tx:any)=>{await tx`LOCK TABLE control_room_incidents IN ACCESS EXCLUSIVE MODE`;locked();await finish})
  await acquired
  let bounded=false
  try{await Promise.race([getIncident(i.id).catch(()=>{bounded=true}),new Promise(r=>setTimeout(r,4500))])}finally{release();await blocker;await q.end()}
  assert.equal(bounded,true,'Product DB read did not fail within 4.5 seconds under an exclusive table lock; add bounded DB lock/query handling without weakening approval rules')
 }
 if(gate==='iteration5'){
  const prior=await toolsData.similar('ferry',i.id) as {id:string;origin?:string;sourceRefs?:unknown[]}[]
  assert.ok(prior.some(p=>['snapshot','bahn_packet'].includes(p.origin??'')),'Memory must retrieve relevant resolved snapshot incidents, not just participant overlays')
  assert.ok(prior.every(p=>p.id!==i.id&&Array.isArray(p.sourceRefs)&&p.sourceRefs.length>0),'Memory results need origin/source references and must exclude current case')
  const fresh=createIncident('ord-00603','alert-x5259ff7f2e03f0e6','delay');assert.throws(()=>executeApproved(fresh,1),/proposal|approval/i)
 }
 console.log(`PASS ${gate}: MOCKED MODEL / REAL ISOLATED POSTGRES AND HTTP. No provider API called; source order unchanged.`)
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})
