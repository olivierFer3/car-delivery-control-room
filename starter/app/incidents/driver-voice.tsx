"use client"
import {useEffect,useRef,useState} from 'react'
import {Conversation} from '@elevenlabs/client'
import {VoiceCapture} from '@/lib/incidents/voice-client'
import type {VoiceSession} from '@/lib/incidents/voice-contracts'
import styles from './incidents.module.css'
export function DriverVoice({incidentId,onResume}:{incidentId:string;onResume:()=>void}){
 const [,render]=useState(0),[available,setAvailable]=useState(false),[sessions,setSessions]=useState<VoiceSession[]>([]),[notice,setNotice]=useState(''),[eta,setEta]=useState(''),[safety,setSafety]=useState(''),[blockers,setBlockers]=useState(''),[text,setText]=useState(''),[reviewed,setReviewed]=useState(false),[saving,setSaving]=useState(false)
 const capture=useRef<VoiceCapture|null>(null)
 const endpoint=`/api/incidents/${incidentId}/voice`
 async function api(body:unknown){const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});const d=await r.json();if(!r.ok)throw Error(d.error??'Voice request failed');return d}
 if(!capture.current)capture.current=new VoiceCapture({api,microphone:async()=>{if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone unavailable');const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(t=>t.stop())},connect:options=>Conversation.startSession(options),changed:()=>render(n=>n+1)})
 const c=capture.current
 async function refresh(){try{const r=await fetch(endpoint,{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);setAvailable(d.available);setSessions(d.sessions);setNotice(d.available?'':'Voice is not configured/enabled on this server. Use the text reply below.')}catch(e){setNotice(e instanceof Error?e.message:'Voice unavailable')}}
 useEffect(()=>{void refresh();return()=>capture.current?.dispose()},[incidentId]) // Explicit user action is required for microphone/connection.
 const canReview=c.state==='ended'&&c.transcript.some(t=>t.role==='driver')
 return <section aria-label="Simulated driver voice" className={styles.panel}><h3>Speak as the simulated driver</h3><p>You play the fictional driver. The assistant asks for this incident’s missing ETA, safety and blockers. Nothing is submitted until you review and confirm. Text reply remains available below.</p>
 <p role="status">Voice: {c.state==='permission'?'Requesting microphone permission':c.state}</p>
 {notice&&<p>{notice}</p>}{(c.error)&&<p role="alert" className={styles.error}>{c.error}</p>}
 <div className={styles.filters}><button className={styles.secondary} onClick={()=>void refresh()}>Refresh voice availability/history</button>
 <button className={styles.primary} disabled={!available||['permission','connecting','active','ended','confirmed'].includes(c.state)} onClick={()=>{setReviewed(false);setText('');void c.start()}}>Start simulated voice</button>
 {['permission','connecting','active'].includes(c.state)&&<><button className={styles.secondary} onClick={()=>void c.finish('cancelled')}>Cancel voice</button><button className={styles.secondary} disabled={c.state!=='active'} onClick={()=>void c.finish('ended')}>End and review transcript</button></>}
 </div>
 {c.transcript.length>0&&<details open><summary>Captured transcript · unverified until you confirm</summary><ol>{c.transcript.map(t=><li key={t.id}><strong>{t.role==='driver'?'You · simulated driver':'Voice assistant'}</strong><p>{t.text}</p><small>{t.at}</small></li>)}</ol></details>}
 {canReview&&<form className={styles.review} onSubmit={async e=>{e.preventDefault();setSaving(true);setNotice('');try{await c.confirm({terminalEta:eta,safe:safety==='safe',blockers:blockers.split('\n').map(x=>x.trim()).filter(Boolean),text});await refresh()}catch(error){setNotice(error instanceof Error?error.message:'Could not confirm reply')}finally{setSaving(false)}}}>
 <p>Review the original transcript above. Enter/correct the structured reply; these fields are not inferred from a failed conversation.</p>
 <button type="button" className={styles.secondary} onClick={()=>setText(c.transcript.filter(t=>t.role==='driver').map(t=>t.text).join('\n'))}>Copy driver transcript into reviewed reply</button>
 <label>Terminal ETA (UTC, ending Z)<input required value={eta} onChange={e=>setEta(e.target.value)} placeholder="2026-10-21T14:00:00Z"/></label>
 <label>Driver safety<select required value={safety} onChange={e=>setSafety(e.target.value)}><option value="">Choose explicitly</option><option value="safe">Driver reports safe</option><option value="unconfirmed">Safety not confirmed</option></select></label>
 <label>Reported blockers (one per line; blank means none reported)<textarea value={blockers} onChange={e=>setBlockers(e.target.value)} maxLength={4000}/></label>
 <label>Reviewed simulated reply<textarea required value={text} onChange={e=>setText(e.target.value)} maxLength={4000}/></label>
 <label><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/> I reviewed this transcript and confirm the ETA, safety and blockers as a fictional driver report.</label>
 <button className={styles.primary} disabled={!reviewed||saving}>{saving?'Confirming…':'Confirm simulated driver reply'}</button><button type="button" className={styles.secondary} onClick={()=>{void c.finish('cancelled')}}>Discard this capture</button>
 </form>}
 {c.state==='confirmed'&&<p>Reply saved to this same incident. No booking change was made. <button className={styles.primary} onClick={onResume}>Resume this incident investigation</button></p>}
 <details className={styles.raw}><summary>Saved voice sessions · {sessions.length}</summary>{sessions.map(s=><article key={s.id}><p>{s.status} · session {s.id} · conversation {s.conversationId??'not connected'} · {s.updatedAt}</p><p>Sources: {s.sourceRefs.join(', ')}</p>{s.status==='ended'&&<button className={styles.secondary} onClick={()=>{c.restore(s);setReviewed(false);setEta('');setSafety('');setText('')}}>Review this saved capture</button>}{['connecting','active'].includes(s.status)&&<button className={styles.secondary} onClick={async()=>{try{await api({action:'save',sessionId:s.id,version:s.version,status:'cancelled',conversationId:s.conversationId,transcript:s.transcript});await refresh()}catch(error){setNotice(error instanceof Error?error.message:'Could not cancel capture')}}}>Cancel saved interrupted capture</button>}{s.transcript.map(t=><p key={t.id}>{t.role}: {t.text} · {t.at}</p>)}</article>)}</details>
 </section>
}
