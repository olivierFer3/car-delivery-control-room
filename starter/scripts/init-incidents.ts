import "dotenv/config"
import { initializeStore } from "../lib/incidents/store"
initializeStore().then(() => { console.log("Incident overlay ready; snapshot unchanged"); process.exit(0) }).catch(error => { console.error(error); process.exit(1) })
