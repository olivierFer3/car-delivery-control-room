import postgres from 'postgres'
import {randomUUID} from 'node:crypto'
import {receiveDriverReply,WorkflowError} from './engine'
import type {Incident} from './contracts'
import type {VoiceReply,VoiceSession,TranscriptLine,VoiceStatus} from './voice-contracts'
let pool:ReturnType<typeof postgres>|undefined
function sql(){if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');return pool??=postgres(process.env.DATABASE_URL,{max:3,connect_timeout:3,connection:{lock_timeout:1500,statement_timeout:3000}})}
const now=()=>new Date().toISOString()
function check(ok:unknown,message:string):asserts ok{if(!ok)throw new WorkflowError(message)}
export function waitingForVoice(i:Incident){return i.mode==='llm'&&i.workflow!=='human_review'&&i.state==='waiting'&&!i.driverReplies?.length&&!i.proposals.length&&!i.executions.length&&!i.activeRun&&i.tasks.some(t=>t.tool==='ask_driver'&&(t.result as {status?:string})?.status==='no_response')}
export async function initializeVoiceStore(){await sql()`CREATE TABLE IF NOT EXISTS voice_sessions (id text PRIMARY KEY, incident_id text NOT NULL, body jsonb NOT NULL)`;await sql()`CREATE INDEX IF NOT EXISTS voice_sessions_incident ON voice_sessions (incident_id)`}
export async function listVoiceSessions(incidentId:string){await initializeVoiceStore();const rows=await sql()`SELECT body FROM voice_sessions WHERE incident_id=${incidentId} ORDER BY body->>'createdAt' DESC LIMIT 20`;return rows.map(r=>r.body as VoiceSession)}
export async function reserveVoiceSession(incidentId:string):Promise<VoiceSession>{
 await initializeVoiceStore()
 return sql().begin(async tx=>{
  const [row]=await tx`SELECT body FROM control_room_incidents WHERE id=${incidentId} FOR UPDATE`;check(row,'Incident not found');const i=row.body as Incident
  check(waitingForVoice(i),'Voice requires this incident to be waiting for an unanswered simulated driver question')
  const active=await tx`SELECT id,body FROM voice_sessions WHERE incident_id=${incidentId} AND body->>'status' IN ('connecting','active') FOR UPDATE`
  for(const row of active){const prior=row.body as VoiceSession;check(Date.parse(prior.expiresAt)<=Date.now(),'A voice capture is already open; end or cancel it first');prior.status='error';prior.error='Capture expired/interrupted; no reply was submitted';prior.updatedAt=now();prior.version++;await tx`UPDATE voice_sessions SET body=${tx.json(prior as any)} WHERE id=${prior.id}`}
  const sources=i.evidence.filter(e=>e.kind!=='assumption').slice(0,30),question=i.tasks.find(t=>t.tool==='ask_driver')?.args.question
  const context=JSON.stringify({simulation:true,notice:'Operator acts as fictional driver. Collect missing facts only; never approve, book, contact anyone or assert delivery.',orderId:i.orderId,incidentId:i.id,question,missing:i.missing,sources:sources.map(e=>({id:e.id,source:e.source,at:e.at,text:e.text.slice(0,2000)}))})
  const session:VoiceSession={id:randomUUID(),incidentId:i.id,orderId:i.orderId,status:'connecting',version:1,createdAt:now(),updatedAt:now(),expiresAt:new Date(Date.now()+150000).toISOString(),simulationTime:i.simulationTime,sourceRefs:sources.map(e=>e.id),context,missing:[...i.missing],transcript:[]}
  await tx`INSERT INTO voice_sessions (id,incident_id,body) VALUES (${session.id},${incidentId},${tx.json(session as any)})`;return session
 })
}
export async function saveVoiceSession(incidentId:string,id:string,input:{version:number;status:VoiceStatus;conversationId?:string;transcript:TranscriptLine[]}):Promise<VoiceSession>{
 return sql().begin(async tx=>{
  const [row]=await tx`SELECT body FROM voice_sessions WHERE id=${id} AND incident_id=${incidentId} FOR UPDATE`;check(row,'Voice session not found');const s=row.body as VoiceSession
  check(s.version===input.version,'Voice transcript changed; refresh before saving or confirming')
  check(!['confirmed','cancelled','error'].includes(s.status),'Voice capture is already final; start a new capture if needed')
  check(['connecting','active','ended','cancelled','error'].includes(input.status),'Invalid voice state')
  check(s.status!=='ended'||['ended','cancelled','error'].includes(input.status),'Ended capture cannot reconnect')
  check(Array.isArray(input.transcript)&&input.transcript.length<=100,'Transcript limit is 100 messages')
  const lines=input.transcript;check(lines.length>=s.transcript.length,'Transcript history cannot be deleted')
  check(new Set(lines.map(l=>l.id)).size===lines.length,'Duplicate transcript event')
  for(const [n,line] of lines.entries()){
   check(typeof line.id==='string'&&line.id.length<=120&&['agent','driver'].includes(line.role)&&typeof line.text==='string'&&line.text.trim().length>0&&line.text.length<=3000&&typeof line.at==='string'&&Number.isFinite(Date.parse(line.at)),'Invalid transcript message')
   const old=s.transcript[n];if(old)check(old.id===line.id&&old.role===line.role&&old.text===line.text&&old.at===line.at,'Transcript history cannot be rewritten')
  }
  if(input.conversationId){check(/^conv_[a-zA-Z0-9_-]{1,100}$/.test(input.conversationId),'Invalid provider conversation ID');check(!s.conversationId||s.conversationId===input.conversationId,'Conversation ID cannot change');s.conversationId=input.conversationId}
  s.transcript=lines.map((line,n)=>s.transcript[n]??{id:line.id,role:line.role,text:line.text,at:line.at,receivedAt:now()})
  s.status=input.status;s.version++;s.updatedAt=now();if(input.status==='error')s.error='Voice connection failed or interrupted; transcript is unconfirmed and no reply was submitted'
  await tx`UPDATE voice_sessions SET body=${tx.json(s as any)} WHERE id=${id}`;return s
 })
}
export async function failReservedSession(incidentId:string,session:VoiceSession){return saveVoiceSession(incidentId,session.id,{version:session.version,status:'error',transcript:session.transcript})}
export async function confirmVoiceReply(incidentId:string,id:string,version:number,reply:VoiceReply){
 return sql().begin(async tx=>{
  // Same lock order as reservation: incident then voice. Reply, evidence and confirmation commit together.
  const [ir]=await tx`SELECT body FROM control_room_incidents WHERE id=${incidentId} FOR UPDATE`;check(ir,'Incident not found');const i=ir.body as Incident
  const [vr]=await tx`SELECT body FROM voice_sessions WHERE id=${id} AND incident_id=${incidentId} FOR UPDATE`;check(vr,'Voice session not found');const s=vr.body as VoiceSession
  const clean:VoiceReply={terminalEta:reply?.terminalEta,safe:reply?.safe,blockers:reply?.blockers,text:reply?.text}
  if(s.status==='confirmed'){check(s.reply?.terminalEta===clean.terminalEta&&s.reply.safe===clean.safe&&s.reply.text===clean.text&&JSON.stringify(s.reply.blockers)===JSON.stringify(clean.blockers),'Conflicting duplicate voice confirmation');return {session:s,incident:i}}
  check(s.version===version,'Voice transcript changed; review the current version before confirming')
  check(s.status==='ended'&&!!s.conversationId&&s.transcript.some(t=>t.role==='driver'),'Only an ended conversation with a driver transcript can be confirmed')
  check(waitingForVoice(i),'Incident is no longer waiting for this voice reply; refresh its history')
  receiveDriverReply(i,{command:'receive_driver_reply',...clean})
  const sourceId=`voice:${s.id}`;i.evidence.push({id:sourceId,source:`simulated_voice_session:${s.id}`,at:i.simulationTime,kind:'reported',text:JSON.stringify({sessionId:s.id,conversationId:s.conversationId,transcriptVersion:s.version,sourceRefs:s.sourceRefs,transcript:s.transcript,reviewedReply:clean,provenance:'Client-reported transcript reviewed and confirmed by operator acting as fictional driver'})})
  i.timeline.push({type:'voice_reply_confirmed',at:i.simulationTime,text:`Operator confirmed simulated voice session ${s.id}; source ${sourceId}. Reply recorded; resume investigation explicitly. No booking action performed.`})
  s.status='confirmed';s.reply=clean;s.confirmedAt=now();s.updatedAt=now();s.version++
  await tx`UPDATE control_room_incidents SET body=${tx.json(i as any)} WHERE id=${incidentId}`
  await tx`UPDATE voice_sessions SET body=${tx.json(s as any)} WHERE id=${id}`
  return {session:s,incident:i}
 })
}
