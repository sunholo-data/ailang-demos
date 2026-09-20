// Offline browser regression: the model response is held/mocked; AILANG physics runs.
const {chromium}=require('../scripts/smoke/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let release,requests=0;
  const fixture=process.env.NOULS_ART_FIXTURE||path.join(__dirname,'site/assets/bold.webp');
  const media=fixture.endsWith('.png')?'image/png':'image/webp';
  const data=`data:${media};base64,${fs.readFileSync(fixture).toString('base64')}`;
  await page.route('https://openrouter.ai/api/v1/images',async route=>{
   requests++;
   const body=route.request().postDataJSON();assert(body.prompt);assert.equal(body.model,'black-forest-labs/flux.2-klein-4b');
   const result=await new Promise(resolve=>{release=resolve;});
   await route.fulfill(result.ok?{json:{data:[{media_type:media,b64_json:fs.readFileSync(fixture).toString('base64')}],usage:{cost:result.cost}}}:{status:402,json:{error:result.error}}).catch(()=>{});
  });
  await page.goto(process.env.NOULS_PREVIEW_URL||'http://127.0.0.1:8954/decisions/');
  await page.waitForFunction(()=>document.querySelector('#runtime').textContent.includes('ready'),{timeout:120000});
  await page.evaluate(async()=>{await rpc('configure',[],{mode:'simulate'});mode='simulate';liveKey='test-key';const s=await(await publicTransport.request('api/session')).json();liveSession=s.session;sessionBudget=s.budget;running=true;});
  async function place(description){
   await page.locator('#add-item').tap();await page.locator('#artifact').fill(description);
   await page.locator('#place').tap();await page.waitForFunction(()=>!busy);
   await page.locator('#place-center').tap();await page.waitForFunction(()=>!addingItem);
  }
  await place('A warm glowing stone');
  await page.waitForFunction(()=>artJobs.size===1);
  assert.equal(await page.evaluate(()=>world.entities.at(-1).desc),'A warm glowing stone');
  assert.equal(await page.evaluate(()=>running),true);
  const tick=await page.evaluate(()=>world.tick);
  await page.waitForFunction(t=>world.tick>t,tick);
  assert.equal(await page.locator('#player-art image').count(),0);
  assert((await page.locator('#artwork-status').innerText()).includes('Drawing'));
  while(!release)await page.waitForTimeout(20);
  release({ok:true,image:data,cost:.014,sessionCost:.014});
  await page.waitForFunction(()=>artJobs.size===0);
  assert.equal(await page.locator('#player-art image').count(),1);
  assert.equal(await page.evaluate(()=>sessionCost),.014);
  await page.evaluate(()=>running=false);await page.waitForFunction(()=>!busy);
  await page.locator('.world-wrap').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/nouls-generated-item-mobile.png'});
  // Failure leaves the item and current pause state intact.
  release=null;await place('A tiny bell');while(!release)await page.waitForTimeout(20);
  release({ok:false,error:'Not enough session budget for a picture.'});
  await page.waitForFunction(()=>artJobs.size===0);
  assert.equal(await page.evaluate(()=>world.entities.at(-1).desc),'A tiny bell');
  assert.equal(await page.evaluate(()=>running),false);
  assert((await page.locator('#artwork-status').innerText()).includes('remains'));
  // A supplied picture takes precedence; unchecked generation also spends nothing.
  const before=requests;
  await page.locator('#add-item').tap();await page.locator('#item-picture summary').tap();
  await page.locator('#artifact-image').setInputFiles(path.join(__dirname,'site/assets/bold.webp'));
  await page.waitForFunction(()=>pendingArtwork!==null);
  assert(await page.locator('#generate-art').isDisabled());
  await page.locator('#artifact').fill('My own picture');await page.locator('#place').tap();await page.locator('#place-center').tap();
  await page.waitForFunction(()=>!addingItem);
  assert.equal(requests,before);
  await page.locator('#add-item').tap();await page.locator('#generate-art').uncheck();await page.locator('#cancel-item').tap();
  await place('Description only');assert.equal(requests,before);
  // Reset invalidates a response already in flight, even if IDs are reused later.
  await page.locator('#add-item').tap();await page.locator('#generate-art').check();await page.locator('#cancel-item').tap();
  release=null;await place('A late picture');while(!release)await page.waitForTimeout(20);
  await page.evaluate(()=>{liveKey='';running=false;});await page.locator('#reset').tap();
  release({ok:true,image:data,cost:.014,sessionCost:.028});
  await page.waitForFunction(()=>artJobs.size===0&&artwork.size===0&&!world.entities.some(e=>e.desc==='A late picture'));
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#player-art image').count(),0);
  assert.deepEqual(errors,[]);
  assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
  console.log('PASS background generation with live physics, billed cost, failure fallback, uploaded precedence, opt-out, reset/stale-response protection and mobile layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
