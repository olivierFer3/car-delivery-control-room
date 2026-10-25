import {WorkflowError} from './engine'
import type {VoiceSession} from './voice-contracts'
export function voiceConfigured(){return process.env.ELEVENLABS_LIVE_ENABLED==='true'&&!!process.env.ELEVENLABS_API_KEY?.trim()&&/^agent_[a-zA-Z0-9_-]+$/.test(process.env.ELEVENLABS_AGENT_ID??'')}
export function requireVoiceConfig(){if(!voiceConfigured())throw new WorkflowError('Voice is unavailable. Configure the private ElevenLabs agent and explicitly enable live voice on the server. Text replies remain available.')}
export async function signedVoiceSession(session:VoiceSession){
 requireVoiceConfig()
 const url=new URL('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url');url.searchParams.set('agent_id',process.env.ELEVENLABS_AGENT_ID!);url.searchParams.set('include_conversation_id','true')
 const response=await fetch(url,{headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY!},signal:AbortSignal.timeout(10000),cache:'no-store'})
 if(!response.ok)throw new Error('Voice authorization service unavailable; no driver reply was recorded')
 const body=await response.json();const signed=new URL(body.signed_url)
 if(signed.protocol!=='wss:'||signed.hostname!=='api.elevenlabs.io'||signed.pathname!=='/v1/convai/conversation')throw new Error('Invalid voice session URL')
 return {signedUrl:signed.href,connectionType:'websocket' as const,maxSeconds:120,dynamicVariables:{incident_context:session.context,missing_information:session.missing.join('; '),source_references:session.sourceRefs.join(', '),simulation_time:session.simulationTime,incident_id:session.incidentId,session_id:session.id},session}
}
