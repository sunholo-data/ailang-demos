// Synthetic Jev answers; real WASM world, provider wire codec, bank and UI.
const {chromium}=require('../scripts/smoke/node_modules/playwright');
const assert=require('node:assert/strict');
const fixture=require('./test-provider-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.NOULS_PREVIEW_URL||'http://127.0.0.1:8959/decisions/');
  await page.waitForFunction(()=>window.__demoReady,null,{timeout:120000});
  await page.evaluate(async()=>{
   running=false;
   let habitat=(await call('init')).world;
   for(let i=0;i<3;i++){
    habitat.creatures[0].pos={...habitat.creatures[1].pos};
    habitat.creatures[0].intent={tag:'Socialize',id:'c2'};
    habitat=(await call('coast',JSON.stringify(habitat))).world;
   }
   draw(await call('coast',JSON.stringify(habitat)));await selectCreature('c1');
  });
  const snapshot=await page.evaluate(()=>JSON.stringify(world));
  const request=await page.evaluate(async snapshot=>JSON.parse((await call('prepareLive',snapshot,'c1',0)).body),snapshot);
  assert(request.questions.self_belief);
  const reply=fixture(request);reply.answers.self_belief={type:'choice',choice:'company',confidence:.9,probabilities:{company:1}};
  const row=await page.evaluate(async({snapshot,reply})=>{
   await rpc('configure',[],{mode:'simulate'});
   const result=await call('completeLive',snapshot,'c1',JSON.stringify(reply));
   rows.push(result.row);
   draw(await call('applyDecision',JSON.stringify(world),snapshot,JSON.stringify(result.row)));
   await selectCreature('c1');
   return result.row;
  },{snapshot,reply});
  assert.equal((await page.evaluate(async row=>(await call('review',JSON.stringify(row))).verified,row)),true);
  await page.locator('#identity-activity').click();
  await page.locator('#self-description').waitFor({state:'visible'});
  assert.match(await page.locator('#self-description').innerText(),/gentle company/);
  await page.locator('.self-image summary').click();
  assert.match(await page.locator('#original-description').innerText(),/safety/);
  assert.equal(await page.locator('.identity-change li').count(),3);
  assert.match(await page.locator('.identity-change li').first().innerText(),/Bold Noul/);
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:900});
   const overflow=await page.locator('#observation-panel').evaluate(el=>el.scrollWidth>el.clientWidth+1);
   assert.equal(overflow,false,`identity panel overflow at ${width}px`);
   await page.locator('.self-image').scrollIntoViewIfNeeded();
   await page.screenshot({path:`/tmp/nouls-identity-${width}.png`});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS identity UI: completed encounters, real WASM reflection and bank replay, habitat notice, original/current descriptions, evidence, desktop and 390/320px mobile');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
