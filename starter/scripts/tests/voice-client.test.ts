import {test} from 'node:test'
import assert from 'node:assert/strict'
import {VoiceCapture,type ConnectOptions} from '../../lib/incidents/voice-client'
import type {VoiceSession} from '../../lib/incidents/voice-contracts'
const session=():VoiceSession=>({id:'session',incidentId:'incident',orderId:'order',status:'connecting',version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+150000).toISOString(),simulationTime:'2026-10-21T09:00:00Z',sourceRefs:['reservation'],context:'Selected incident only; simulated driver',missing:['Driver ETA'],transcript:[]})
function fixture(){let callbacks!:ConnectOptions,ended=0,starts=0,confirmed=0;let saved=session()
 const api=async(b:any)=>{
  if(b.action==='start'){starts++;saved=session();return {session:saved,signedUrl:'wss://api.elevenlabs.io/v1/convai/conversation?test',dynamicVariables:{incident_id:'incident'},maxSeconds:120}}
  if(b.action==='save'){assert.equal(b.version,saved.version);saved={...saved,...b,version:saved.version+1};return {session:saved}}
  confirmed++;saved={...saved,status:'confirmed'};return {session:saved,incident:{id:'incident'}}
 }
 const c=new VoiceCapture({api,microphone:async()=>{},connect:async opts=>{callbacks=opts;assert.equal(opts.dynamicVariables.incident_id,'incident');opts.onConnect({conversationId:'conv_test'});return {getId:()=> 'conv_test',endSession:async()=>{ended++}}},changed:()=>{}})
 return {c,api,get callbacks(){return callbacks},stats:()=>({starts,ended,confirmed})}
}
test('voice transcript is reviewed before confirming; restore ended capture; same incident returned',async()=>{
 const f=fixture();await f.c.start();assert.equal(f.c.state,'active')
 f.callbacks.onMessage({event_id:1,role:'agent',message:'This is simulated. What is your ETA?'})
 f.callbacks.onMessage({event_id:2,role:'user',message:'ETA 14:00 UTC, safe, no blockers'})
 f.callbacks.onMessage({event_id:2,role:'user',message:'ETA 14:00 UTC, safe, no blockers'})
 await assert.rejects(()=>f.c.confirm({terminalEta:'2026-10-21T14:00:00Z',safe:true,blockers:[],text:'Reviewed'}),/End/)
 await f.c.finish('ended');f.c.dispose();assert.equal(f.c.state,'ended');assert.equal(f.c.transcript.length,2);assert.equal(f.stats().confirmed,0)
 const other=fixture();other.c.restore(f.c.session!);const result=await other.c.confirm({terminalEta:'2026-10-21T14:00:00Z',safe:true,blockers:[],text:'Reviewed'})
 assert.equal(result.id,'incident');assert.equal(other.c.state,'confirmed')
})
test('microphone denial creates no provider session and no fabricated reply',async()=>{
 let requests=0;const c=new VoiceCapture({api:async()=>{requests++},microphone:async()=>{throw new DOMException('denied','NotAllowedError')},connect:async()=>{throw Error('not called')},changed:()=>{}})
 await c.start();assert.equal(c.state,'error');assert.match(c.error,/permission denied/);assert.equal(requests,0);assert.deepEqual(c.transcript,[])
})
test('cancellation during microphone prompt prevents connection',async()=>{
 let release!:()=>void,requested=0;const mic=new Promise<void>(r=>release=r)
 const c=new VoiceCapture({api:async()=>{requested++},microphone:()=>mic,connect:async()=>{throw Error('must not connect')},changed:()=>{}})
 const pending=c.start();await c.finish('cancelled');release();await pending;assert.equal(c.state,'cancelled');assert.equal(requested,0)
})
test('cancelled late connection closes SDK transport; no reply submitted',async()=>{
 const f=fixture();await f.c.start();await f.c.finish('cancelled');assert.equal(f.c.state,'cancelled');assert.ok(f.stats().ended>=1);assert.equal(f.stats().confirmed,0)
 await assert.rejects(()=>f.c.confirm({terminalEta:'2026-10-21T14:00:00Z',safe:true,blockers:[],text:'No'}),/End/)
})
test('interrupted conversation stays error and cannot be confirmed; explicit retry recovers',async()=>{
 const f=fixture();await f.c.start();f.callbacks.onMessage({event_id:1,role:'user',message:'partial report'})
 f.callbacks.onDisconnect({reason:'error'});await new Promise(r=>setTimeout(r,0));assert.equal(f.c.state,'error')
 await assert.rejects(()=>f.c.confirm({terminalEta:'2026-10-21T14:00:00Z',safe:true,blockers:[],text:'partial'}),/End/)
 await f.c.start();assert.equal(f.c.state,'active');assert.deepEqual(f.c.transcript,[]);await f.c.finish('cancelled');assert.equal(f.stats().confirmed,0)
})
test('an ended conversation with only agent speech cannot invent a driver report',async()=>{
 const f=fixture();await f.c.start();f.callbacks.onMessage({event_id:1,role:'agent',message:'Hello'});await f.c.finish('ended')
 await assert.rejects(()=>f.c.confirm({terminalEta:'2026-10-21T14:00:00Z',safe:true,blockers:[],text:'invented'}),/driver transcript/)
})
