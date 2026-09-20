// Synthetic recorded decisions, real AILANG world/replay and rendered inventory.
const {chromium}=require('../scripts/smoke/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.NOULS_PREVIEW_URL||'https://voights-mac-studio.tail97eda0.ts.net:8443/decisions/');
  await page.waitForFunction(()=>document.querySelector('#runtime').textContent.includes('ready'),{timeout:120000});
  await page.evaluate(async()=>{
    const c=world.creatures.find(c=>c.id==='c2');
    draw(await call('addEntity',JSON.stringify(world),'A tiny brass bell',String(c.pos.x),String(c.pos.y)));
    window.itemId=world.entities.at(-1).id;
    const blob=await (await fetch('assets/curious.webp')).blob();
    const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});
    artwork.set(itemId,data);drawArtwork();
    window.itemAction=async(mode,tag)=>{
      const choice=(key,ps)=>({kind:'ChoiceA',choice:key,confidence:1,probabilities:ps});
      const row={tick:world.tick,creatureId:'c2',soul:'bold',source:'synthetic',roll:.5,
        state:JSON.stringify((await call('perceptOf',JSON.stringify(world),'c2')).state),questions:'[]',note:'Synthetic inventory browser test',
        decision:JSON.stringify({model:'synthetic-items',id:'items',input_tokens:0,output_tokens:0,cost_usd:0,answers:[
          {name:'behavior',answer:choice(mode,[{key:mode,p:1}])},{name:mode+'_target',answer:choice(itemId,[{key:itemId,p:1}])}]}),
        action:JSON.stringify({tag:'Do',intent:tag==='Drop'?{tag}:{tag,id:itemId}})};
      rows=[row];await selectCreature('c2');await showRow(0);
      draw(await call('enact',JSON.stringify(world),JSON.stringify(row)));
    };
    await itemAction('pickup','PickUp');
  });
  assert.equal(await page.locator('#carried-art image').count(),1);
  assert.equal(await page.locator('#player-art image').count(),0);
  assert((await page.locator('#carrying-note').innerText()).includes('tiny brass bell'));
  assert((await page.locator('#item-activity').innerText()).includes('picked up'));
  assert((await page.locator('#outcome').innerText()).includes('PickUp: A tiny brass bell'));
  await page.evaluate(async()=>{window.heldImage=document.querySelector('#carried-art image');draw(await call('coast',JSON.stringify(world)));});
  assert(await page.evaluate(()=>heldImage===document.querySelector('#carried-art image')));
  const attached=await page.evaluate(()=>{const s=motion.states.get('c2');motion.paint(s,s.start+s.duration/2);const matrix=s.held.transform.baseVal.consolidate().matrix;return Math.abs(matrix.e-s.x-2.3)<.002&&Math.abs(matrix.f-s.y+.5)<.002;});
  assert(attached,'Held artwork follows the interpolated creature position');
  await page.locator('.world-wrap').scrollIntoViewIfNeeded();
  await page.screenshot({path:'/tmp/nouls-carrying-mobile.png'});
  await page.evaluate(()=>itemAction('drop','Drop'));
  assert.equal(await page.locator('#carried-art image').count(),0);
  assert.equal(await page.locator('#player-art image').count(),1);
  assert((await page.locator('#item-activity').innerText()).includes('put down'));
  await page.evaluate(async()=>{world.creatures.find(c=>c.id==='c2').pos={...world.entities.find(e=>e.id===itemId).pos};await itemAction('pickup','PickUp');await itemAction('destroy','Destroy');});
  assert.equal(await page.locator('#carried-art image').count(),0);
  assert.equal(await page.locator('#player-art image').count(),0);
  assert((await page.locator('#item-activity').innerText()).includes('destroyed'));
  assert((await page.locator('#carrying-note').innerText()).includes('nothing'));
  assert(!(await page.evaluate(()=>artwork.has(itemId))));
  assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
  await page.setViewportSize({width:1440,height:1080});await page.screenshot({path:'/tmp/nouls-inventory-desktop.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS real AILANG item lifecycle in browser, held artwork identity/motion, inventory inspector, activity notices, replay labels and mobile layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
