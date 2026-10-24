/** Called only with the API-budget preload and isolated DB. No artifact writes to tracked docs. */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createLiveIncident, commandIncidentService } from '../starter/lib/incidents/service'
const db=new URL(process.env.DATABASE_URL??'');assert.equal(db.port,'15438');assert.equal(db.pathname,'/controlroom_overnight_validation')
assert.ok(process.env.OVERNIGHT_API_BUDGET)
async function main(){
 const evidence=[]
 for(const scenario of ['delay','disproved','no_response'] as const){
  let i=await createLiveIncident(scenario,'groq');i=await commandIncidentService(i.id,{command:'run'});evidence.push(i)
  if(scenario==='delay')assert.equal(i.state,'needs_decision',i.lastAgentError??i.stopReason)
  if(scenario==='disproved')assert.equal(i.state,'resolved',i.lastAgentError??i.stopReason)
  if(scenario==='no_response'){
   assert.equal(i.state,'waiting',i.lastAgentError??i.stopReason)
   await commandIncidentService(i.id,{command:'receive_driver_reply',terminalEta:'2026-10-21T10:00:00Z',safe:true,blockers:[],text:'Explicit fictional service reply'})
   i=await commandIncidentService(i.id,{command:'run'});evidence[evidence.length-1]=i;assert.equal(i.state,'resolved');assert.equal(i.tasks.filter(t=>t.tool==='ask_driver').length,1)
  }
 }
 const out=process.env.OVERNIGHT_API_BUDGET!.replace('api-budget.json','fresh-live-evidence.json');await writeFile(out,JSON.stringify({kind:'fresh real provider',evidence},null,2)+'\n');console.log('PASS fresh real-provider verification; fictional services only')
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})
