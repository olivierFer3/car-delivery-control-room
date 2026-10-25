"use client"
import Link from 'next/link'
import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import {AppFrame} from '../../components/app-frame'
import {SIMULATION_TIME} from '@/lib/incidents/contracts'
import type {OperationalOrder} from '@/lib/incidents/operational'
import {openOrderInvestigation} from '../actions'
import {OperatorAccess} from '../operator-access'
import {StatusBadge,agentDecision,checkStatus,incidentStatus} from '../status'
import type {PublicIncident} from '@/lib/incidents/contracts'
import styles from '../incidents.module.css'
export default function OperationalOrders(){
 const router=useRouter(),[check,setCheck]=useState('launched'),[incidents,setIncidents]=useState<Record<string,PublicIncident>>({}),[rows,setRows]=useState<OperationalOrder[]|null>(null),[query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(''),[refresh,setRefresh]=useState(0),[selected,setSelected]=useState<Record<string,string>>({}),[provider,setProvider]=useState('gemini'),[providers,setProviders]=useState<{name:string;configured:boolean;model:string|null}[]>([])
 useEffect(()=>{const controller=new AbortController();setError('');Promise.all([fetch('/api/incidents/orders',{signal:controller.signal,cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setRows(d.orders)}),fetch('/api/incidents',{signal:controller.signal,cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setIncidents(Object.fromEntries(d.incidents.map((i:PublicIncident)=>[i.id,i])))}),fetch('/api/agent-status',{signal:controller.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Could not check model configuration');const d=await r.json();setProviders(d.providers);setProvider(d.providers.find((p:{name:string;configured:boolean})=>p.name==='gemini'&&p.configured)?.name??d.providers.find((p:{configured:boolean})=>p.configured)?.name??'gemini')})]).catch(e=>{if(!controller.signal.aborted)setError(e.message??'Could not load orders')});return()=>controller.abort()},[refresh])
 useEffect(()=>{setCheck(new URLSearchParams(window.location.search).get('check')??'launched')},[])
 const launched=(o:OperationalOrder)=>o.incidents.length>0
 const matches=(o:OperationalOrder)=>(!check||(check==='launched'?launched(o):o.checkStatus===check))&&`${o.reference} ${o.id} ${o.status} ${o.checkStatus}`.toLowerCase().includes(query.toLowerCase())
 const counts=rows?.reduce<Record<string,number>>((c,o)=>({...c,[o.checkStatus]:(c[o.checkStatus]??0)+1}),{})??{}
 async function open(order:OperationalOrder,id:string){setBusy(order.id);setError('');try{const result=await openOrderInvestigation(order.id,id,provider);if(!result.incident)throw Error(result.error);router.push(`/incidents/${result.incident.id}`)}catch(e){setError(e instanceof Error?e.message:'Could not open investigation')}finally{setBusy('')}}
 return <AppFrame section="incidents" snapshotAt={SIMULATION_TIME}><main className={styles.page}>
 <header className={styles.hero}><div><p className={styles.eyebrow}>Control room · synthetic operations</p><h1>All supplied orders</h1><p>Every order stays here, checked or not. Pick the signal to investigate, or hand an unsupported case to a person.</p></div><div className={styles.heroTools}><OperatorAccess/><Link href="/incidents?view=workspace" className={styles.secondary}>Decisions and waiting cases →</Link></div></header>
 <div className={styles.notice}><strong>Real agent · fictional services</strong><span>Driver replies arrive as explicit simulated events. No real messages or bookings. Incident resolution never means delivery.</span></div>
 <details className={styles.raw}><summary>Model configuration</summary><label>Provider <select aria-label="Investigation provider" value={provider} onChange={e=>setProvider(e.target.value)}>{providers.filter(p=>['groq','gemini'].includes(p.name)).map(p=><option key={p.name} value={p.name}>{p.name} · {p.configured?p.model:'not configured'}</option>)}</select></label><p>Credentials remain on the server. No mock reasoning is substituted.</p></details>
 {rows&&!providers.some(p=>p.configured&&['groq','gemini'].includes(p.name))&&<p role="alert" className={styles.error}><span><strong>Agent investigations are off on this server:</strong> no Groq or Gemini key is set. You can still hand orders to a person and open existing incidents. To turn the agent on, add <code>GROQ_API_KEY</code> to <code>starter/.env</code> and restart the server.</span></p>}
 {error&&<div role="alert" className={styles.error}>{error}<button className={styles.secondary} onClick={()=>setRefresh(n=>n+1)}>Try again</button></div>}
 {!rows&&!error&&<p role="status">Loading orders and investigation history…</p>}
 <div className={styles.toolbar}>
 <label className={styles.label}>Find an order <input aria-label="Find an order" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Order reference, ID or status"/></label>
 {rows&&<div className={styles.chips} role="group" aria-label="Filter by check status"><button aria-pressed={check==='launched'} onClick={()=>setCheck('launched')}>Investigated · {rows.filter(launched).length}</button><button aria-pressed={!check} onClick={()=>setCheck('')}>All orders · {rows.length}</button>{Object.entries(counts).map(([k,n])=><button key={k} aria-pressed={check===k} onClick={()=>setCheck(check===k?'':k)}>{k} · {n}</button>)}</div>}
 {rows&&<p role="status">{rows.filter(matches).length} of {rows.length} supplied orders shown · snapshot time {SIMULATION_TIME}</p>}
 </div>
 <ul className={`${styles.cards} ${styles.rows}`}>{rows?.filter(matches).map(o=>{const signal=o.signals.find(s=>s.id===selected[o.id])??o.signals[0];return <li key={o.id} className={`${styles.panel} ${styles.orderRow}`} data-order-id={o.id}>
 <div className={styles.cardTop}><h3><Link href={`/orders/${o.id}`}>{o.reference}</Link></h3><StatusBadge status={checkStatus(o.checkStatus)}/></div><p>Recorded delivery state: {o.status}</p>
 <label className={styles.label}>Signal to investigate <select aria-label={`Source for ${o.reference}`} value={signal.id} onChange={e=>setSelected(x=>({...x,[o.id]:e.target.value}))}>{o.signals.map(s=><option key={s.id} value={s.id}>{s.summary}</option>)}</select></label>
 <p>{signal.reason}</p><p className={styles.source}>Raised {new Date(signal.at).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'})} UTC{signal.supported?'':' · unsupported: a person handles it'}</p><details><summary className={styles.source}>Source record</summary><p className={styles.source}>{signal.id}</p></details>
 {o.incidents.map(({id})=>{const i=incidents[id];if(!i)return null;const d=agentDecision(i);return <dl key={id} className={styles.verdict} data-kind={d.kind}><div><dt>Problem</dt><dd>{o.signals.find(x=>x.id===i.signalId)?.summary??i.summary}</dd></div><div><dt>Agent decision</dt><dd>{d.text}</dd></div><div><dt>Status</dt><dd><StatusBadge status={incidentStatus(i)}/> <Link href={`/incidents/${id}`}>Open incident →</Link></dd></div></dl>})}
 <button className={signal.supported?styles.primary:styles.secondary} disabled={!!busy||(signal.supported&&!providers.find(p=>p.name===provider)?.configured)} onClick={()=>open(o,signal.id)}>{busy===o.id?'Opening…':signal.supported?'Open investigation':'Hand to human review'}</button>
 </li>})}</ul>
 {rows&&!rows.some(matches)&&<p className={styles.empty}>{check==='launched'&&!query?'No investigation has been launched yet. Pick an order under All orders.':'No matching orders.'} <button className={styles.secondary} onClick={()=>{setQuery('');setCheck('')}}>Clear filters</button></p>}
 </main></AppFrame>
}
