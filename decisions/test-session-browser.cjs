const {chromium}=require('../scripts/smoke/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const fixture=require('./test-provider-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let calls=0;
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('openrouter-api-key','test-only-key'));
  await page.route('https://openrouter.ai/**',async route=>{calls++;const reply=fixture(JSON.parse(route.request().postData()));reply.usage={cost:.11};await route.fulfill({json:reply});});
  await page.goto(process.env.NOULS_PREVIEW_URL||'http://127.0.0.1:8959/decisions/');
  await page.waitForFunction(()=>window.__demoReady,null,{timeout:120000});
  assert.equal(calls,0,'remembered key must not authorize spending');
  assert.equal(await page.locator('#object-labels text').count(),15);
  await page.locator('#object-labels [data-object="e1"]').hover();
  assert.equal(await page.locator('#object-description strong').innerText(),'Grey mushroom');
  assert.match(await page.locator('#object-description p').innerText(),/pale gills/);
  await page.locator('#close-description').click();
  await page.locator('#add-item').click();
  await page.locator('#artifact-title').fill('Rainwater cup');
  await page.locator('#artifact').fill('A little clay cup full of clean rainwater');
  await page.locator('#artifact-form').evaluate(form=>form.requestSubmit());
  await page.locator('#place-center').click();
  await page.waitForFunction(()=>world.entities.length===16&&!busy);
  assert.match(await page.locator('#object-labels').textContent(),/Rainwater cup/);
  await page.locator('#connect-live').click();await page.locator('#key-form').evaluate(form=>form.requestSubmit());
  await page.locator('#session-stop').waitFor({state:'visible',timeout:60000});
  assert.equal(calls,1,'a final billed response crossing the cap must stop requests');
  assert.equal(await page.evaluate(()=>running),false);
  assert(await page.locator('#story-peek .story-event').count()>0);
  const state=await page.evaluate(()=>JSON.stringify(world));
  const downloadPromise=page.waitForEvent('download');await page.locator('#save-session-stop').click();const download=await downloadPromise;
  const file=await download.path(),saved=JSON.parse(await fs.readFile(file,'utf8'));
  assert.equal(JSON.stringify(saved.world),state);assert.equal(saved.rows.length,1);assert(!JSON.stringify(saved).includes('test-only-key'));
  assert(saved.titles.some(([id,title])=>title==='Rainwater cup'));
  await page.locator('#reset').click();await page.waitForFunction(()=>world.tick===0&&!busy);
  assert.equal(await page.evaluate(()=>sessionCost),.11,'reset must retain spending');
  assert.equal(await page.evaluate(()=>running),false);
  await page.locator('#history').click();await page.locator('#import-bank').setInputFiles(file);
  await page.waitForFunction(()=>!importingSession&&world.entities.length===16&&sessionStopped);
  assert.equal(await page.evaluate(()=>JSON.stringify(world)),state,'restoring must not advance a tick or change needs');
  assert.equal(calls,1,'import must never spend');
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:900});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`page overflow ${width}`);
   await page.screenshot({path:`/tmp/nouls-session-${width}.png`});
  }
  await page.locator('#continue-session').click();
  await page.waitForFunction(()=>sessionCost>=.1&&sessionStopped);
  assert.equal(calls,2,'only an explicit new approval can spend again');
  assert.equal(await page.evaluate(()=>rows.length),2,'continuation retains the previous bank');
  await page.locator('#observe').click();
  for(const width of [390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('#observation-panel').evaluate(el=>el.scrollWidth>el.clientWidth+1),false);await page.screenshot({path:`/tmp/nouls-mind-${width}.png`});}
  assert.deepEqual(errors,[]);
  console.log('PASS real WASM session: title/description, budget stop, download, lossless restore, opt-in continuation, bank retained, mobile layout, no automatic spending');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
