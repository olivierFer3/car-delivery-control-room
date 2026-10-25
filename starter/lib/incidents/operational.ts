import { SIMULATION_TIME, type Incident } from "./contracts"
import type { Context, RecordRow } from "./engine"
export type OrderSignal = { id: string; summary: string; at: string; supported: boolean; reason: string }
export type OperationalOrder = { id: string; reference: string; status: string; checkStatus: string; signals: OrderSignal[]; incidents: {id:string;state:string}[] }
/** Supported scope is a future, uniquely identified booked ferry, never all alerts. */
export function orderSignals(c: Context): OrderSignal[] {
  const ferries=c.reservations.filter(r=>r.kind==="FERRY"&&r.status==="BOOKED")
  const current=ferries.filter(r=>typeof r.assignment_id==="string"&&typeof r.check_in_cutoff_at==="string"&&Number.isFinite(Date.parse(r.check_in_cutoff_at))&&Date.parse(r.check_in_cutoff_at)>Date.parse(SIMULATION_TIME))
  const available=current.length===1&&!['DELIVERED','CANCELLED'].includes(String(c.order.status))
  const rows=[...c.alerts,...ferries]
  if(!rows.length)rows.push(c.order)
  return rows.map(r=>{
    const relevant=r.kind==="FERRY"||(/FERRY_CONNECTION_RISK|DRIVER_DELAY/.test(String(r.signal))&&['OPEN','ACKNOWLEDGED'].includes(String(r.status)))
    const supported=available&&relevant&&(r.assignment_id===undefined||r.assignment_id===current[0]?.assignment_id)&&(!r.kind||r.id===current[0]?.id)
    return {id:r.id,summary:String(r.summary??(r.kind==="FERRY"?'Review booked ferry connection':'Manual review of order')),at:String(r.triggered_at??r.booked_at??r.updated_at??SIMULATION_TIME),supported,reason:supported?'Supported ferry-risk investigation; driver reply and bookings are simulated':'Human review required: outside the supported future-booked-ferry workflow, ambiguous booking, inactive signal or missing timing/assignment'}
  })
}
export function orderCheckStatus(incidents: Incident[]): string {
  if(!incidents.length)return 'Not checked'
  if(incidents.some(i=>i.state==='technical_error'))return 'Technical review required'
  if(incidents.some(i=>i.workflow==='human_review'))return 'Human review required'
  if(incidents.some(i=>i.state!=='resolved'))return 'Investigation / decision pending'
  return incidents.every(i=>!i.proposals.length)?'Checked · no action needed':'Checked · incident resolved; delivery separate'
}
export function sourceTimestamp(row:RecordRow){return String(row.triggered_at??row.booked_at??row.updated_at??SIMULATION_TIME)}
