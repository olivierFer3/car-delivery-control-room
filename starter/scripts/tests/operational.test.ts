import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {orderSignals,orderCheckStatus} from '../../lib/incidents/operational'
import {simulatedTravelOptions} from '../../lib/incidents/fixtures'
import {createIncident,useTool} from '../../lib/incidents/engine'
import type {Context,RecordRow} from '../../lib/incidents/engine'
const rows=(n:string)=>readFileSync(`../dataset/data/${n}.jsonl`,'utf8').trim().split('\n').map(l=>JSON.parse(l) as RecordRow)
const orders=rows('orders'),reservations=rows('travel_reservations'),alerts=rows('alerts')
function context(id:string):Context{return {order:orders.find(o=>o.id===id)!,alerts:alerts.filter(r=>r.order_id===id),reservations:reservations.filter(r=>r.order_id===id),messages:[],options:[]}}
test('supplied snapshot supports six future ferry orders; historical bookings and unrelated alerts are human-only',()=>{
 const supported=orders.filter(o=>orderSignals(context(o.id)).some(s=>s.supported)).map(o=>o.id)
 assert.deepEqual(supported,['ord-00075','ord-00324','ord-00439','ord-00442','ord-00584','ord-00603'])
 assert.ok(orderSignals(context('ord-00020')).every(s=>!s.supported))
 const c=context('ord-00075');c.alerts=[{id:'wrong-workflow',signal:'VEHICLE_WARNING',status:'OPEN'}];assert.equal(orderSignals(c).find(s=>s.id==='wrong-workflow')!.supported,false)
 c.reservations.push({...c.reservations[0],id:'ambiguous'});assert.ok(orderSignals(c).every(s=>!s.supported))
})
test('fictional alternatives preserve each order/assignment and dates; no cross-order capacity is inferred',()=>{
 for(const id of ['ord-00075','ord-00324','ord-00442']){
  const c=context(id),options=simulatedTravelOptions(id,c.reservations);assert.equal(options.length,2)
  assert.ok(options.every(o=>o.order_id===id&&o.assignment_id===c.reservations[0].assignment_id&&o.data_origin==='SIMULATED_SERVICE'))
  assert.ok(Date.parse(String(options[0].check_in_cutoff_at))>Date.parse(String(c.reservations[0].check_in_cutoff_at)))
 }
 assert.deepEqual(simulatedTravelOptions('unknown',[]),[])
})
test('operational reservation source can be read; cross-order source still rejected',async()=>{
 const c=context('ord-00324'),i=createIncident(c.order.id,c.reservations[0].id,'no_response');i.workflow='ferry_delay'
 const data={context:async()=>c,similar:async()=>[]};await useTool(i,{tool:'get_order_context',args:{}},data)
 assert.ok(i.evidence.some(e=>e.id===i.signalId&&e.at&&e.source.startsWith('dataset:')))
 const invalid=createIncident(c.order.id,'foreign-reservation','no_response');invalid.workflow='ferry_delay'
 await assert.rejects(()=>useTool(invalid,{tool:'get_order_context',args:{}},data),/not linked/)
})
test('unchecked, no-action, human, technical and delivery states remain distinct',()=>{
 assert.equal(orderCheckStatus([]),'Not checked')
 const i=createIncident('order','source','no_response');i.workflow='ferry_delay';i.state='resolved';assert.equal(orderCheckStatus([i]),'Checked · no action needed')
 i.state='technical_error';assert.equal(orderCheckStatus([i]),'Technical review required')
 i.workflow='human_review';i.state='waiting';assert.equal(orderCheckStatus([i]),'Human review required')
})
