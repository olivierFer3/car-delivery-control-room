import 'dotenv/config'
import assert from 'node:assert/strict'
import { readFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const base=process.env.APP_URL??'http://127.0.0.1:3001'
const get=async url=>{const r=await fetch(base+url);assert.equal(r.status,200,url);return r.json()}
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),args:['--no-sandbox']})
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[]
page.on('pageerror',e=>errors.push(e.message))
const artifact=path.resolve('../docs/verification');await mkdir(artifact,{recursive:true})
try {
 const before=await get('/api/incidents'),existing=new Map(before.incidents.map(i=>[i.id,JSON.stringify(i)]))
 const statuses=await get('/api/agent-status');assert.equal(statuses.providers.find(p=>p.name==='groq').configured,true);assert.equal(statuses.providers.find(p=>p.name==='gemini').configured,true)
 const gemini=JSON.parse(await readFile(path.join(artifact,'iteration2-live-gemini.json'),'utf8')).cases[0]
 await page.goto(`${base}/incidents/${gemini.id}`);await page.getByText('Driver delay · real LLM investigation',{exact:true}).waitFor()
 await page.getByRole('heading',{name:'Incident agent',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Prepare mock proposal',exact:true}).count(),0)
 await page.getByText('Provider calls and tool results · diagnostics',{exact:true}).click();await page.getByRole('heading',{name:/gemini-3.5-flash-lite/}).first().waitFor()
 await page.getByText('Provider calls and tool results · diagnostics',{exact:true}).click()
 await page.screenshot({path:path.join(artifact,'iteration2-gemini.png'),fullPage:false})
 const live=JSON.parse(await readFile(path.join(artifact,'iteration2-live-groq.json'),'utf8'))
 const executed=live.cases.find(i=>i.executions.length)
 assert.ok(executed,'Real-provider execution acceptance evidence required')
 await page.goto(`${base}/incidents/${executed.id}`);await page.getByRole('heading',{name:'Simulated booking change completed',exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:/Approve version/}).count(),0)
 await page.screenshot({path:path.join(artifact,'iteration2-executed.png'),fullPage:false})
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile overflow')
 await page.screenshot({path:path.join(artifact,'iteration2-mobile.png'),fullPage:true})
 await page.setViewportSize({width:1440,height:1000});await page.goto(`${base}/incidents?view=workspace`)
 await page.getByRole('heading',{name:'Start a real agent investigation',exact:true}).waitFor()
 await page.getByRole('button',{name:'Open real investigation',exact:true}).click()
 await page.getByRole('alert').filter({hasText:'Unlock operator access'}).waitFor()
 assert.ok(process.env.INCIDENT_OPERATOR_TOKEN)
 await page.getByLabel('Operator token',{exact:false}).fill(process.env.INCIDENT_OPERATOR_TOKEN)
 await page.getByRole('button',{name:'Unlock decisions',exact:true}).click();await page.getByText('Operator access unlocked.').waitFor()
 await page.locator('#live-agent-provider').selectOption('gemini')
 await page.locator('#live-agent-scenario').selectOption('no_response')
 await page.getByRole('button',{name:'Open real investigation',exact:true}).click();await page.waitForURL(/\/incidents\/[^/]+$/)
 await page.getByRole('button',{name:'Run real investigation',exact:true}).waitFor()
 const fresh=await get('/api/incidents/'+page.url().split('/').at(-1));assert.equal(fresh.mode,'llm');assert.equal(fresh.preferredProvider,'gemini');assert.equal(fresh.scenario,'no_response');assert.equal(fresh.tasks.length,0)
 await page.screenshot({path:path.join(artifact,'iteration2-launcher.png'),fullPage:false})
 const after=await get('/api/incidents');for(const [id,body] of existing)assert.equal(JSON.stringify(after.incidents.find(i=>i.id===id)),body)
 assert.deepEqual(errors,[])
 console.log('PASS: Groq/Gemini configuration status, live Gemini evidence, actual Groq execution receipt, no mock button in real incidents, operator unlock boundary, provider/scenario launcher, mobile overflow, existing histories unchanged, no browser errors. No model calls made by this browser check.')
 console.log(`Fresh operator-ready case: ${page.url()}`)
}catch(error){console.log(JSON.stringify({url:page.url(),headings:await page.locator('h1,h2').allTextContents(),selects:await page.locator('select').evaluateAll(xs=>xs.map(x=>({id:x.id,label:x.parentElement.textContent}))) }));throw error}finally{await browser.close()}
