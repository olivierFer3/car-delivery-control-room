"use client"
import Link from 'next/link'
import {useEffect,useState} from 'react'
import {useRouter} from 'next/navigation'
import {AppFrame} from '../../components/app-frame'
import {SIMULATION_TIME} from '@/lib/incidents/contracts'
import type {OperationalOrder} from '@/lib/incidents/operational'
import {openOrderInvestigation} from '../actions'
import {OperatorAccess} from '../operator-access'
import styles from '../incidents.module.css'
export default function OperationalOrders(){
 const router=useRouter(),[rows,setRows]=useState<OperationalOrder[]|null>(null),[query,setQuery]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(''),[refresh,setRefresh]=useState(0),[selected,setSelected]=useState<Record<string,string>>({}),[provider,setProvider]=useState('gemini'),[providers,setProviders]=useState<{name:string;configured:boolean;model:string|null}[]>([])
 useEffect(()=>{const controller=new AbortController();setError('');Promise.all([fetch('/api/incidents/orders',{signal:controller.signal,cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setRows(d.orders)}),fetch('/api/agent-status',{signal:controller.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Could not check model configuration');const d=await r.json();setProviders(d.providers);setProvider(d.providers.find((p:{name:string;configured:boolean})=>p.name==='gemini'&&p.configured)?.name??d.providers.find((p:{configured:boolean})=>p.configured)?.name??'gemini')})]).catch(e=>{if(!controller.signal.aborted)setError(e.message??'Could not load orders')});return()=>controller.abort()},[refresh])
 async function open(order:OperationalOrder,id:string){setBusy(order.id);setError('');try{const result=await openOrderInvestigation(order.id,id,provider);if(!result.incident)throw Error(result.error);router.push(`/incidents/${result.incident.id}`)}catch(e){setError(e instanceof Error?e.message:'Could not open investigation')}finally{setBusy('')}}
 return <AppFrame section="incidents" snapshotAt={SIMULATION_TIME}><main className={styles.page}>
 <header className={styles.header}><div><p className={styles.eyebrow}>Control room · synthetic operations</p><h1>Order investigations</h1><p>Review the selected order and source. A quiet queue does not mean every order was checked.</p></div><Link href="/incidents?view=workspace" className={styles.secondary}>Decisions and waiting cases →</Link></header>
 <OperatorAccess/>
 <div className={styles.notice}><strong>Real agent · fictional services</strong><span>Driver replies arrive as explicit simulated events. No real messages or bookings. Incident resolution never means delivery.</span></div>
 <details className={styles.raw}><summary>Model configuration</summary><label>Provider <select aria-label="Investigation provider" value={provider} onChange={e=>setProvider(e.target.value)}>{providers.filter(p=>['groq','gemini'].includes(p.name)).map(p=><option key={p.name} value={p.name}>{p.name} · {p.configured?p.model:'not configured'}</option>)}</select></label><p>Credentials remain on the server. No mock reasoning is substituted.</p></details>
 {rows&&!providers.some(p=>p.configured&&['groq','gemini'].includes(p.name))&&<p role="alert" className={styles.error}>No real agent provider is configured. Set private Groq or Gemini credentials and an allowed model on the server. Human handoff and existing records remain accessible.</p>}
 <label>Find an order <input aria-label="Find an order" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Order reference, ID or status"/></label>
 {error&&<div role="alert" className={styles.error}>{error}<button onClick={()=>setRefresh(n=>n+1)}>Refresh</button></div>}
 {!rows&&!error&&<p role="status">Loading orders and investigation history…</p>}
 {rows&&<p>{rows.length} supplied orders · snapshot time {SIMULATION_TIME}</p>}
 <ul className={styles.cards}>{rows?.filter(o=>`${o.reference} ${o.id} ${o.status} ${o.checkStatus}`.toLowerCase().includes(query.toLowerCase())).map(o=>{const signal=o.signals.find(s=>s.id===selected[o.id])??o.signals[0];return <li key={o.id} className={styles.panel} data-order-id={o.id}>
 <div className={styles.cardTop}><Link href={`/orders/${o.id}`}>{o.reference}</Link><strong>{o.checkStatus}</strong></div><p>Recorded delivery state: {o.status}</p>
 <label>Initial source <select aria-label={`Source for ${o.reference}`} value={signal.id} onChange={e=>setSelected(x=>({...x,[o.id]:e.target.value}))}>{o.signals.map(s=><option key={s.id} value={s.id}>{s.summary}</option>)}</select></label>
 <p>{signal.reason}</p><p className={styles.source}>Source: {signal.id} · {signal.at}</p>
 {o.incidents.map(i=><p key={i.id}><Link href={`/incidents/${i.id}`}>Open existing incident · {i.state}</Link></p>)}
 <button className={styles.primary} disabled={!!busy||(signal.supported&&!providers.find(p=>p.name===provider)?.configured)} onClick={()=>open(o,signal.id)}>{busy===o.id?'Opening…':signal.supported?'Open investigation':'Hand to human review'}</button>
 </li>})}</ul>
 {rows&&!rows.some(o=>`${o.reference} ${o.id} ${o.status} ${o.checkStatus}`.toLowerCase().includes(query.toLowerCase()))&&<p className={styles.empty}>No matching orders.</p>}
 </main></AppFrame>
}
