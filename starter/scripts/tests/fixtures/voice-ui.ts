/** Explicit isolated fixture, not a real LLM investigation. Never calls a provider. */
import {randomUUID} from 'node:crypto'
import {createIncident,useTool} from '../../../lib/incidents/engine'
import {initializeStore,insertIncident,toolsData} from '../../../lib/incidents/store'
import {reserveVoiceSession} from '../../../lib/incidents/voice-store'
const u=new URL(process.env.DATABASE_URL??'');if(process.env.VOICE_FIXTURE_ALLOWED!=='true'||u.hostname!=='127.0.0.1'||u.port!=='15440'||u.pathname!=='/controlroom_driver_voice')throw Error('Use only the explicitly allowed isolated voice fixture database')
async function main(){
 await initializeStore();const fixtures=[]
 for(let n=0;n<3;n++){
  const i=createIncident('ord-00324','res-x0c658361818f4c47','no_response');i.demoRunId=randomUUID();i.workflow='ferry_delay';i.mode='llm';i.preferredProvider='gemini'
  await useTool(i,{tool:'get_order_context',args:{}},toolsData);await useTool(i,{tool:'ask_driver',args:{question:'This is simulated. What is your terminal ETA, safety and any blockers?'}},toolsData)
  i.timeline.push({type:'test_fixture',at:i.simulationTime,text:'Explicit test fixture: initial question was not selected by a real LLM. No provider call was made.'});await insertIncident(i)
  fixtures.push({incidentId:i.id,session:n<2?await reserveVoiceSession(i.id):null})
 }
 console.log(JSON.stringify({fixture:true,fixtures}))
}
main().then(()=>process.exit(0),e=>{console.error(e);process.exit(1)})
