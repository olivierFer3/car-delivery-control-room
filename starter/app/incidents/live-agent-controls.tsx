"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { Command, PublicIncident, Scenario } from "@/lib/incidents/contracts"
import { createAgentIncident } from "./actions"
import styles from "./incidents.module.css"
export function LiveAgentLauncher() {
  const router=useRouter(), [scenario,setScenario]=useState<Scenario>("delay"),[provider,setProvider]=useState<"groq"|"gemini">("groq"),[busy,setBusy]=useState(false),[error,setError]=useState("")
  const [providers,setProviders]=useState<{name:string;configured:boolean;model:string|null}[]>([])
  useEffect(()=>{fetch("/api/agent-status",{cache:"no-store"}).then(r=>r.json()).then(r=>setProviders(r.providers)).catch(()=>setError("Could not check agent configuration"))},[])
  return <section className={styles.panel} style={{marginBottom:24}} aria-label="Start real investigation"><h2>Start a real agent investigation</h2><p className={styles.consequences}>The model chooses its tools. Driver replies and ferry services remain fictional. Existing incident histories are preserved.</p><div className={styles.filters}>
    <label htmlFor="live-agent-provider">Provider<select id="live-agent-provider" value={provider} onChange={e=>setProvider(e.target.value as "groq"|"gemini")}>{["groq","gemini"].map(p=><option key={p} value={p}>{p === "groq" ? "Groq" : "Gemini"}{providers.find(x=>x.name===p)?.configured ? " · configured" : " · not configured"}</option>)}</select></label>
    <label htmlFor="live-agent-scenario">Simulated driver scenario<select id="live-agent-scenario" value={scenario} onChange={e=>setScenario(e.target.value as Scenario)}><option value="delay">Arrival after ferry check-in closes</option><option value="disproved">Safe arrival before check-in closes</option><option value="no_response">Driver does not reply</option></select></label>
    <button className={styles.primary} disabled={busy || !providers.find(p=>p.name===provider)?.configured} onClick={async()=>{setBusy(true);setError("");try{const r=await createAgentIncident(scenario,provider);if(r.incident)router.push(`/incidents/${r.incident.id}`);else setError(r.error??"Could not open incident")}catch{setError("Could not create investigation")}finally{setBusy(false)}}}>{busy?"Opening…":"Open real investigation"}</button></div>{error&&<p role="alert" className={styles.error}>{error}</p>}
    <details className={styles.raw}><summary>Provider configuration</summary><p>Configure private GROQ_API_KEY or GEMINI_API_KEY on the server. Provider/model selection is server-validated. Credentials are never sent to the browser.</p>{providers.map(p=><p key={p.name}>{p.name}: {p.model ?? "not configured"}</p>)}</details>
  </section>
}
export function LiveAgentControls({incident,busy,act}:{incident:PublicIncident;busy:boolean;act:(command:Command,label:string)=>Promise<void>}) {
  const [question,setQuestion]=useState(""),[eta,setEta]=useState("2026-10-21T10:00:00Z"),[safe,setSafe]=useState(true),[replyText,setReplyText]=useState("Simulation: I am safe, there are no other blockers; terminal ETA is 10:00 UTC.")
  const runnable=["investigating","waiting","technical_error"].includes(incident.state)&&!incident.executions.length
  const active=!!incident.activeRun&&Date.parse(incident.activeRun.expiresAt)>Date.now()
  return <section className={styles.panel} style={{marginBottom:24}} aria-label="Live agent controls"><h2>Incident agent</h2>
    {incident.lastAgentError&&<p role="alert" className={styles.error}>{incident.lastAgentError}</p>}
    {active&&<p role="status">Investigation in progress. Model-selected checks are saved as they finish.</p>}
    {runnable&&<button className={styles.primary} disabled={busy||active} onClick={()=>act({command:"run"},"Agent investigating…")}>{incident.tasks.length?"Resume real investigation":"Run real investigation"}</button>}
    {incident.state==="waiting"&&incident.tasks.some(t=>t.tool==="ask_driver")&&!incident.driverReplies?.length&&<details className={styles.raw}><summary>Simulate a driver reply arriving</summary><p>This is a fictional service event, not an agent-generated fact.</p><div className={styles.filters}><label>Terminal ETA (UTC)<input value={eta} onChange={e=>setEta(e.target.value)}/></label><label>Driver safe<select value={String(safe)} onChange={e=>setSafe(e.target.value==="true")}><option value="true">Safe · no other blockers</option><option value="false">Safety not confirmed</option></select></label><label>Driver message<input value={replyText} maxLength={4000} onChange={e=>setReplyText(e.target.value)}/></label><button className={styles.secondary} disabled={busy||active} onClick={()=>act({command:"receive_driver_reply",terminalEta:eta,safe,blockers:[],text:replyText},"Recording simulated reply…")}>Receive simulated reply</button></div><p>Then resume the agent; its original question and waiting history are retained.</p></details>}
    <form className={styles.review} onSubmit={async e=>{e.preventDefault();await act({command:"message",text:question},"Agent answering…");setQuestion("")}}><label htmlFor="agent-question">Ask why, compare consequences, or clarify the evidence</label><textarea id="agent-question" value={question} onChange={e=>setQuestion(e.target.value)} maxLength={4000} required disabled={busy||active}/><button className={styles.secondary} disabled={busy||active}>Ask the agent</button><p className={styles.footnote}>Conversation explains recorded evidence. To change the proposal, use Request alternative; every new version requires a fresh approval.</p></form>
    <ol className={styles.timeline} style={{marginTop:16}}>{incident.conversation.map((m,n)=><li key={n}><strong>{m.role==="agent"?"Agent":"Operator"}</strong><p className={styles.prose}>{m.text}</p></li>)}</ol>
    {incident.stopReason&&<p className={styles.decision}>Stopped: {incident.stopReason}</p>}
    <details className={styles.raw}><summary>Provider calls and tool results · diagnostics</summary>{incident.modelTurns?.map((t,n)=><article className={styles.run} key={t.id}><h3>Call {n+1} · {t.provider} · {t.actualModel??t.model}</h3><p>{t.purpose} · {t.at}</p><p>{t.responseId??"No provider response ID"}</p><pre>{JSON.stringify({endpoint:t.endpoint,selected:t.selected,result:t.result,error:t.error},null,2)}</pre></article>)}</details>
  </section>
}
