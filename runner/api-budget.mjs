/** Loaded only into the controlled Node live-verification child, never the coding worker. */
import fs from 'node:fs'
const file=process.env.OVERNIGHT_API_BUDGET
if(!file)throw new Error('OVERNIGHT_API_BUDGET is required')
const original=globalThis.fetch
const allowed=new Set(['api.groq.com','generativelanguage.googleapis.com','api.x.ai'])
globalThis.fetch=async(input,init={})=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url)
 if(!allowed.has(url.hostname))throw new Error('Live verification may contact only configured model providers')
 const lock=file+'.lock';let acquired=false
 try{
  fs.mkdirSync(lock);acquired=true
  const budget=JSON.parse(fs.readFileSync(file,'utf8'))
  const run=budget.runs?.find(r=>r.id===budget.active_run)
  if(budget.runs && (!run || run.status!=='running' || budget.runs.length>budget.max_runs))throw new Error('No authorized active verification run')
  if(run && run.calls>=run.max_calls)throw new Error('Per-run model request budget exhausted')
  if(budget.calls>=budget.max_calls)throw new Error('Business API request budget exhausted')
  if(init.body){const body=JSON.parse(String(init.body));if(JSON.stringify(body).length>48000)throw new Error('Provider input budget exceeded');if(url.hostname==='api.groq.com')body.max_completion_tokens=Math.min(body.max_completion_tokens??budget.max_output_tokens,budget.max_output_tokens);if(body.max_output_tokens)body.max_output_tokens=Math.min(body.max_output_tokens,budget.max_output_tokens);if(body.generationConfig)body.generationConfig.maxOutputTokens=Math.min(body.generationConfig.maxOutputTokens??budget.max_output_tokens,budget.max_output_tokens);init={...init,body:JSON.stringify(body)}}
  budget.calls++;if(run)run.calls++;fs.writeFileSync(file+'.tmp',JSON.stringify(budget));fs.renameSync(file+'.tmp',file)
 }finally{if(acquired)fs.rmdirSync(lock)}
 return original(input,{...init,redirect:'error'})
}
