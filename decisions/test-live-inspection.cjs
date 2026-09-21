const {chromium}=require('../scripts/smoke/node_modules/playwright');
const assert=require('node:assert/strict'),fixture=require('./test-provider-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://openrouter.ai/**',r=>r.abort());
  await page.goto(process.env.NOULS_PREVIEW_URL||'http://127.0.0.1:8959/decisions/');
  await page.waitForFunction(()=>window.__demoReady,null,{timeout:120000});
  await page.evaluate(()=>{
   window.originalCall=call;
   call=async(fn,...args)=>fn==='coast'?new Promise(resolve=>window.releaseCoast=async()=>resolve(await originalCall(fn,...args))):originalCall(fn,...args);
   mode='live';running=true;livePending=true;
  });
  await page.waitForFunction(()=>busy&&typeof window.releaseCoast==='function');
  await page.locator('.noul[data-id="c1"] .noul-hit').click();
  assert(await page.locator('#observation-panel').isVisible());
  assert.equal(await page.locator('#creature-name').innerText(),'Wary Noul');
  assert(await page.evaluate(()=>running&&busy),'inspection does not need a pause or a finished tick');
  await page.locator('#creature-tabs button').filter({hasText:'Paranoid'}).click();
  assert.equal(await page.locator('#creature-name').innerText(),'Paranoid Noul');
  await page.evaluate(async()=>{running=false;call=window.originalCall;await window.releaseCoast();});
  await page.waitForFunction(()=>!busy);
  await page.evaluate(async()=>rpc('configure',[],{mode:'simulate'}));
  const request=await page.evaluate(async()=>JSON.parse((await call('prepareLive',JSON.stringify(world),'c2',0)).body));
  await page.evaluate(async reply=>{
   const snapshot=JSON.stringify(world),result=await call('completeLive',snapshot,'c2',JSON.stringify(reply));
   rows.push(result.row);resolvedDecision={row:result.row,snapshot};running=true;
   await loop();running=false;livePending=false;
  },fixture(request));
  assert.equal(await page.evaluate(()=>selected),'c3','another Noul’s live judgment cannot steal the open card');
  assert.equal(await page.locator('#creature-name').innerText(),'Paranoid Noul');
  await page.locator('[data-close="observation-panel"]').click();
  // Keyboard selection also works during an outstanding simulation operation.
  await page.evaluate(()=>busy=true);
  await page.locator('.noul[data-id="c1"]').focus();await page.keyboard.press('Enter');
  assert(await page.locator('#observation-panel').isVisible());
  await page.locator('[data-close="observation-panel"]').click();await page.evaluate(()=>busy=false);
  for(const [width,height] of [[1440,900],[390,844],[320,568],[844,390]]){
   await page.setViewportSize({width,height});
   const boxes=[];
   for(const text of ['', 'A short event', 'A long account of a completed encounter and the changes it made. '.repeat(12), 'Resting']){
    await page.evaluate(text=>{clearStory();if(text){appendStory({kind:'outcome',id:'c1',tick:1,title:text,detail:text,source:'Observed outcome'});renderStory();}},text);
    boxes.push(await page.evaluate(()=>['.habitat-story','.world-wrap','.transport'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [r.x,r.y,r.width,r.height];})));
   }
   for(const box of boxes.slice(1))assert.deepEqual(box,boxes[0],`feed content cannot shift habitat/controls at ${width}x${height}`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS busy live pointer/keyboard inspection, tabs, selected-card retention across real WASM judgments, stable feed/world/control geometry on desktop/mobile/landscape');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
