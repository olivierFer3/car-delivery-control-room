/** Held-out fixtures: do not feed these cases to coding/design prompts. No provider calls. */
import assert from 'node:assert/strict'
import { createIncident, useTool, runAgent, decide, executeApproved, type ToolsData } from '../../starter/lib/incidents/engine'
const data:ToolsData={context:async()=>({order:{id:'holdout-order'},alerts:[{id:'holdout-signal'}],messages:[],reservations:[{id:'holdout-res',kind:'FERRY',status:'BOOKED',check_in_cutoff_at:'2026-10-21T11:17:00Z'}],options:[]}),similar:async()=>[]}
async function main(){
 const i=createIncident('holdout-order','holdout-signal','no_response');i.mode='llm'
 await useTool(i,{tool:'get_order_context',args:{}},data)
 // Exactly at cutoff is distinct from the design fixture's two-hour margin.
 i.driverReplies=[{id:'heldout-reply',terminalEta:'2026-10-21T11:17:00Z',safe:true,blockers:[],text:'Authored held-out simulation',at:i.simulationTime}]
 const checked=await useTool(i,{tool:'check_booking_constraints',args:{reservationId:'holdout-res'}},data) as {canRetain:boolean};assert.equal(checked.canRetain,true)
 i.driverReplies[0].blockers=['Unresolved release hold']
 const blocked=await useTool(i,{tool:'check_booking_constraints',args:{reservationId:'holdout-res'}},data) as {canRetain:boolean};assert.equal(blocked.canRetain,false)
 await assert.rejects(()=>useTool(i,{tool:'close_disproved_alert',args:{reason:'ETA alone looks fine'}},data))
 assert.throws(()=>executeApproved(i,1));assert.throws(()=>decide(i,{command:'decide',version:1,choice:'approve',operator:'test',comment:'Past case approved'}))
 const failed=createIncident('holdout-order','holdout-signal','delay');await runAgent(failed,data,[]);assert.equal(failed.state,'technical_error');assert.equal(failed.executions.length,0)
 console.log('PASS held-out safety/authorization/technical boundaries (scripted fixtures, not real-provider verification)')
}
main().catch(e=>{console.error('Held-out boundary failed; owner review required');process.exitCode=1})
