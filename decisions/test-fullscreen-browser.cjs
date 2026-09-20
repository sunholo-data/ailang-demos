// Static public artifact; real WASM, no provider calls or API key.
const {chromium}=require('../scripts/smoke/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 try{
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://openrouter.ai/**',r=>r.abort());
  await page.goto(process.env.NOULS_PREVIEW_URL||'http://127.0.0.1:8960/decisions/');
  await page.waitForFunction(()=>window.__demoReady,{timeout:120000});
  for(const [width,height] of [[1440,900],[390,844],[320,568],[844,390]]){
   await page.setViewportSize({width,height});
   const layout=await page.evaluate(()=>{
    const w=document.querySelector('#world').getBoundingClientRect();
    return {overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight,square:Math.abs(w.width-w.height)<1,controls:[...document.querySelectorAll('.transport button')].every(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})};
   });
   assert(!layout.overflow,`${width} page should not scroll`);assert(layout.square);assert(layout.controls,`${width} controls fit`);
   await page.screenshot({path:`/tmp/nouls-fullscreen-${width}.png`});
   await page.locator('#observe').click();assert(await page.locator('#observation-panel').isVisible());
   await page.keyboard.press('Escape');assert(!await page.locator('#observation-panel').isVisible());
   await page.locator('#history').click();assert(await page.locator('#history-panel').isVisible());
   await page.locator('[data-close="history-panel"]').click();
   await page.locator('.noul[data-id="c2"] .noul-hit').click();await page.locator('#observation-panel').waitFor({state:'visible'});assert(await page.locator('#observation-panel').isVisible());
   await page.locator('[data-close="observation-panel"]').click();
   // Keyboard selection opens the same inspector; asynchronous background selection does not.
   await page.locator('.noul[data-id="c2"]').focus();await page.keyboard.press('Enter');
   await page.waitForFunction(()=>document.querySelector('#observation-panel').open);
   await page.keyboard.press('Escape');
   await page.evaluate(()=>selectCreature('c1'));assert(!await page.locator('#observation-panel').isVisible());
   await page.locator('#add-item').click();await page.locator('#artifact').fill('A smooth pebble');
   await page.locator('#place').click();
   const bounds=await page.locator('#world').boundingBox();
   await page.locator('#world').click({position:{x:bounds.width*.3,y:bounds.height*.4}});
   await page.waitForFunction(()=>!addingItem&&!busy);
   const placed=await page.evaluate(()=>{const e=world.entities.filter(e=>e.id.startsWith('introduced-')).at(-1);return {x:e.pos.x,y:e.pos.y};});
   assert(Math.abs(placed.x-18)<.5&&Math.abs(placed.y-24)<.5,`Placement coordinates at ${width}: ${JSON.stringify(placed)}`);
   assert(await page.locator('#object-description').isVisible());await page.locator('#close-description').click();
   await page.screenshot({path:`/tmp/nouls-fullscreen-${width}.png`});
  }
  await page.setViewportSize({width:1440,height:900});
  if(await page.locator('#fullscreen').isVisible()){
   await page.locator('#fullscreen').click();await page.waitForFunction(()=>!!document.fullscreenElement);
   await page.locator('#fullscreen').click();await page.waitForFunction(()=>!document.fullscreenElement);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS full-window layouts, desktop/phone/landscape controls, keyboard/panel navigation, real WASM placement coordinates and full-screen toggle; no provider calls.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
