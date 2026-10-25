import {NextResponse} from 'next/server'
import {authorize} from '@/lib/incidents/http'
import {validSession,OPERATOR_COOKIE} from '@/lib/incidents/operator-session'
import {WorkflowError} from '@/lib/incidents/engine'
import {voiceConfigured,requireVoiceConfig,signedVoiceSession} from '@/lib/incidents/voice-provider'
import {listVoiceSessions,reserveVoiceSession,saveVoiceSession,confirmVoiceReply,failReservedSession} from '@/lib/incidents/voice-store'
export const runtime='nodejs'
function allowed(r:Request){const origin=r.headers.get('origin');if(origin&&origin!==new URL(r.url).origin)return false;const cookie=r.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(OPERATOR_COOKIE+'='))?.slice(OPERATOR_COOKIE.length+1);return authorize(r)||validSession(cookie,process.env.INCIDENT_OPERATOR_TOKEN)}
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}})
export async function GET(r:Request,{params}:{params:Promise<{id:string}>}){if(!allowed(r))return json({error:'Unlock operator access to use voice'},401);try{return json({available:voiceConfigured(),maxSeconds:120,sessions:await listVoiceSessions((await params).id)})}catch{return json({error:'Voice history unavailable; text reply remains available'},503)}}
export async function POST(r:Request,{params}:{params:Promise<{id:string}>}){
 if(!allowed(r))return json({error:'Unlock operator access to use voice'},401)
 try{
  const raw=await r.text();if(raw.length>100000)throw new WorkflowError('Voice request too large');const b=JSON.parse(raw),id=(await params).id
  if(b.action==='start'){
   requireVoiceConfig();const session=await reserveVoiceSession(id)
   try{return json(await signedVoiceSession(session))}catch{await failReservedSession(id,session);return json({error:'Voice connection could not be authorized. No reply recorded; use text or retry explicitly.',sessionId:session.id},503)}
  }
  if(typeof b.sessionId!=='string'||!Number.isInteger(b.version))throw new WorkflowError('Session ID and version required')
  if(b.action==='save')return json({session:await saveVoiceSession(id,b.sessionId,b)})
  if(b.action==='confirm')return json(await confirmVoiceReply(id,b.sessionId,b.version,b.reply))
  throw new WorkflowError('Unknown voice action')
 }catch(e){return json({error:e instanceof WorkflowError?e.message:'Voice service failed; no reply inferred. Refresh before retrying.'},e instanceof WorkflowError?409:e instanceof SyntaxError?400:503)}
}
