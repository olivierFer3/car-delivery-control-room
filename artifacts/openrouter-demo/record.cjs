// Records the actual local application; no interception or canned responses.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const path=require('path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:path.resolve('artifacts/openrouter-demo'),size:{width:1440,height:1000}},reducedMotion:'reduce'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8766');
 await page.locator('[data-l=fr]').click();
 await page.locator('[name=mode]').selectOption('openrouter');
 await page.locator('[name=source]').selectOption('hand');
 await page.locator('[name=per_type]').fill('0');
 await page.locator('[name=count]').fill('3');
 await page.locator('[name=workers]').fill('1');
 await page.screenshot({path:'artifacts/openrouter-demo/01-configuration.png',fullPage:true});
 await page.waitForTimeout(2500);
 await page.locator('#go').click();
 let state;const deadline=Date.now()+600000;let started=false;
 while(Date.now()<deadline){
  await page.waitForTimeout(3000);
  state=await page.evaluate(async()=>await(await fetch('/api/status')).json());
  if(state.running)started=true;
  if(state.error)console.log('Run notice:',state.error);
  if(!state.running&&(started||state.report||state.error))break;
 }
 require('fs').writeFileSync('artifacts/openrouter-demo/status.json',JSON.stringify(state,null,2));
 console.log(JSON.stringify({done:state.done,total:state.total,report:state.report,error:state.error,pageErrors:errors}));
 await page.screenshot({path:'artifacts/openrouter-demo/02-results.png',fullPage:true});
 await page.getByText('Chaque cas',{exact:true}).scrollIntoViewIfNeeded().catch(()=>page.locator('details[data-trace]').first().scrollIntoViewIfNeeded());
 await page.waitForTimeout(3000);
 const detail=page.locator('details[data-trace]').first();if(await detail.count()){await detail.locator('summary').click();await detail.scrollIntoViewIfNeeded();await page.waitForTimeout(5000);}
 if(state.report){await page.goto('http://127.0.0.1:8766/report');await page.waitForTimeout(3000);await page.screenshot({path:'artifacts/openrouter-demo/03-report.png',fullPage:true});await page.evaluate(()=>window.scrollBy(0,650));await page.waitForTimeout(5000);}
 await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:8766');await page.waitForTimeout(2500);
 console.log('Mobile overflow:',await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth));
 await page.screenshot({path:'artifacts/openrouter-demo/04-mobile.png',fullPage:true});
 const video=page.video();await context.close();await video.saveAs('artifacts/openrouter-demo/demo-live.webm');await browser.close();
 if(errors.length||state.running||state.error)process.exitCode=1;
})();
