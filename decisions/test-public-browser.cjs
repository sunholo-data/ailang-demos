const {chromium}=require('../scripts/smoke/node_modules/playwright');
const assert=require('node:assert/strict');
const fixture=require('./test-provider-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 try{
  const page=await browser.newPage();const errors=[],localApi=[];let requests=0,release;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(new URL(r.url()).pathname.includes('/decisions/api/'))localApi.push(r.url());});
  await page.route('https://openrouter.ai/api/alpha/decisions',async route=>{
   requests++;assert.equal(route.request().headers().authorization,'Bearer test-key');
   const body=route.request().postDataJSON();assert.equal(body.model,'typesafe/jev-1.13');assert(body.questions.behavior);
   if(requests===1)await new Promise(resolve=>release=resolve);
   await route.fulfill({json:fixture(body)});
  });
  await page.goto(process.env.NOULS_PREVIEW_URL||'http://127.0.0.1:8959/decisions/');
  await page.waitForFunction(()=>window.__demoReady,{timeout:120000});
  await page.locator('#connect-live').click();await page.locator('#api-key').fill('test-key');await page.locator('#key-form button').click();
  while(!release)await page.waitForTimeout(50);
  const tick=await page.evaluate(()=>world.tick);await page.waitForFunction(t=>world.tick>t,tick);
  release();await page.waitForFunction(()=>rows.length>=1);
  await page.evaluate(()=>{running=false;});await page.waitForFunction(()=>!livePending&&!busy);
  const checked=await page.evaluate(async()=>({review:await call('review',JSON.stringify(rows[0])),cost:sessionCost}));
  assert(checked.review.verified);assert(checked.cost>0);assert.equal(localApi.length,0);assert.deepEqual(errors,[]);
  const before=requests;
  await page.evaluate(()=>{publicTransport.sessions.get(liveSession).spent=.1;});
  const blocked=await page.evaluate(async()=>(await publicTransport.request('api/decision',{headers:{'X-Nouls-Key':liveKey},body:JSON.stringify({session:liveSession,world:JSON.stringify(world),id:'c2',completed:1})})).json());
  assert(!blocked.ok);assert.equal(requests,before);
  console.log('PASS public static-only Jev flow: direct provider request, moving world while awaiting network, WASM parse/sample, verified replay, spend stop; zero private API requests');
  // Real browser CORS/auth probe with an intentionally invalid key: no model job or spend.
  if(process.env.NOULS_CHECK_CORS==='1'){
   await page.unroute('https://openrouter.ai/api/alpha/decisions');
   const result=await page.evaluate(async()=>{
    const results=[];
    for(const endpoint of ['/api/alpha/decisions','/api/v1/images']){
     const r=await fetch('https://openrouter.ai'+endpoint,{method:'POST',headers:{Authorization:'Bearer deliberately-invalid-nouls-cors-probe','Content-Type':'application/json'},body:'{}'});
     results.push({endpoint,status:r.status});
    }
    return results;
   });
   assert(result.every(r=>[400,401,403].includes(r.status)));console.log('PASS real browser CORS/auth, invalid key only:',JSON.stringify(result));
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
