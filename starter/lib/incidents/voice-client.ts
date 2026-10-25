/** Browser capture coordinator. Provider and microphone are injected for tests, never mocked by production. */
import type {VoiceReply,VoiceSession,TranscriptLine} from './voice-contracts'
export type CaptureState='idle'|'permission'|'connecting'|'active'|'ended'|'cancelled'|'error'|'confirmed'
export type VoiceHandle={getId():string;endSession():Promise<void>}
export type ConnectOptions={signedUrl:string;connectionType:'websocket';dynamicVariables:Record<string,string|number|boolean>;onConnect:(e:{conversationId:string})=>void;onMessage:(e:{message:string;role:string;event_id:number})=>void;onDisconnect:(e:{reason:string})=>void;onError:(message:string)=>void}
type Dependencies={api:(body:unknown)=>Promise<any>;microphone:()=>Promise<void>;connect:(options:ConnectOptions)=>Promise<VoiceHandle>;changed:()=>void}
export class VoiceCapture {
 state:CaptureState='idle';error='';session?:VoiceSession;transcript:TranscriptLine[]=[]
 private handle?:VoiceHandle;private generation=0;private pending:Promise<void>=Promise.resolve();private timer?:ReturnType<typeof setTimeout>
 constructor(private d:Dependencies){}
 private emit(){this.d.changed()}
 private save(status:'active'|'ended'|'cancelled'|'error'){
  this.pending=this.pending.then(async()=>{
   if(!this.session||this.session.status==='confirmed')return
   const data=await this.d.api({action:'save',sessionId:this.session.id,version:this.session.version,status,conversationId:this.session.conversationId,transcript:this.transcript})
   this.session=data.session;this.emit()
  }).catch(()=>{this.generation++;clearTimeout(this.timer);void this.handle?.endSession().catch(()=>{});this.error='Transcript could not be saved. No reply was submitted; refresh history or use text.';this.state='error';this.emit()})
  return this.pending
 }
 async start(){
  if(['permission','connecting','active'].includes(this.state))return
  const generation=++this.generation;this.state='permission';this.error='';this.session=undefined;this.transcript=[];this.pending=Promise.resolve();this.emit()
  try{
   await this.d.microphone();if(generation!==this.generation)return
   this.state='connecting';this.emit();const data=await this.d.api({action:'start'});this.session=data.session
   if(generation!==this.generation){await this.save('cancelled');return}
   this.emit();let timeout:ReturnType<typeof setTimeout>
   const connecting=this.d.connect({signedUrl:data.signedUrl,connectionType:'websocket',dynamicVariables:data.dynamicVariables,
    onConnect:e=>{if(generation!==this.generation||!this.session)return;this.session.conversationId=e.conversationId;this.state='active';this.emit();void this.save('active')},
    onMessage:e=>{
     if(generation!==this.generation||!['active','connecting'].includes(this.state))return
     const role=e.role==='user'?'driver':'agent',id=`${role}:${e.event_id}`
     if(!e.message.trim()||this.transcript.some(t=>t.id===id))return
     if(this.transcript.length>=30||e.message.length>3000){void this.finish('error','Transcript limit reached; no reply submitted');return}
     this.transcript=[...this.transcript,{id,role,text:e.message,at:new Date().toISOString()}];this.emit();void this.save('active')
    },
    onDisconnect:e=>{if(generation!==this.generation||!['connecting','active'].includes(this.state))return;this.handle=undefined;void this.finish(e.reason==='agent'?'ended':'error',e.reason==='agent'?'':'Conversation interrupted; no reply submitted')},
    onError:()=>{if(generation===this.generation)void this.finish('error','Voice connection failed; no reply submitted. Text remains available.')}
   })
   // A late successful connection after cancellation/timeout must be closed too.
   void connecting.then(h=>{if(generation!==this.generation)void h.endSession().catch(()=>{})}).catch(()=>{})
   this.handle=await Promise.race([connecting,new Promise<never>((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Voice connection timed out')),20000)})]).finally(()=>clearTimeout(timeout))
   if(generation!==this.generation){await this.handle.endSession();return}
   if(this.session&&!this.session.conversationId)this.session.conversationId=this.handle.getId()
   this.timer=setTimeout(()=>void this.finish('ended'),Math.min(data.maxSeconds,120)*1000)
  }catch(error){if(generation!==this.generation)return;await this.finish('error',error instanceof Error&&error.name==='NotAllowedError'?'Microphone permission denied. Enable it in browser settings or use text.':'Microphone or voice service unavailable; no reply submitted. Use text or retry explicitly.')}
 }
 async finish(status:'ended'|'cancelled'|'error',message=''){
  if(this.state==='confirmed'||['cancelled','error'].includes(this.state)||(this.state==='ended'&&status!=='cancelled'))return
  this.generation++;clearTimeout(this.timer);this.state=status;this.error=message;this.emit()
  try{await this.handle?.endSession()}catch{if(status==='ended'){this.state='error';status='error';this.error='Connection ended unexpectedly; no reply submitted'}}
  this.handle=undefined;await this.save(status);this.emit()
 }
 restore(session:VoiceSession){
  if(['permission','connecting','active'].includes(this.state)||session.status!=='ended')throw new Error('Only ended captures can be reviewed')
  this.session=session;this.transcript=[...session.transcript];this.state='ended';this.error='';this.pending=Promise.resolve();this.emit()
 }
 async confirm(reply:VoiceReply){
  await this.pending
  if(this.state!=='ended'||!this.session||!this.transcript.some(t=>t.role==='driver'))throw new Error('End the conversation and review a driver transcript first')
  const data=await this.d.api({action:'confirm',sessionId:this.session.id,version:this.session.version,reply})
  this.session=data.session;this.state='confirmed';this.emit();return data.incident
 }
 dispose(){if(['permission','connecting','active'].includes(this.state))void this.finish('cancelled')}
}
