// Isolated, offline browser integration. Start serve.py on 8943 with no budget.
const {chromium}=require('../scripts/smoke/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{}),headless:true});
try{
const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.NOULS_PREVIEW_URL || 'http://127.0.0.1:8943/decisions/');
await page.waitForSelector('.noul',{timeout:120000});
await page.waitForFunction(()=>document.querySelector('#runtime').textContent.includes('ready'),{timeout:120000});
assert(await page.locator('.noul-label').evaluateAll(labels=>labels.every(label=>Number(label.getAttribute('y'))<0)));
await page.evaluate(()=>{window.__image=document.querySelector('.sprite-a image');window.__original=JSON.stringify(world);});
// Deterministic timestamps exercise interpolation without timing-flaky sleeps.
const check=await page.evaluate(()=>{
 const c=world.creatures[0],s=motion.states.get(c.id);const start=s.x;
 const next=structuredClone(world);next.tick++;next.creatures[0].pos.x+=1;next.creatures[0].heading+=Math.PI/2;
 const t=performance.now();motion.update(next,t);const n=motion.states.get(c.id);motion.paint(n,t+n.duration/2);
 const midpoint=n.x;const walking=n.el.dataset.walking;const view=n.a.getAttribute('viewBox');
 motion.paint(n,t+500);const final=n.x,stopped=n.el.dataset.walking;
 motion.update(world,t+501);
 return {start,midpoint,final,walking,stopped,view};
});
assert(check.midpoint>check.start&&check.midpoint<check.final);assert.equal(check.walking,'true');assert.equal(check.stopped,'false');
await page.evaluate(async()=>{draw(await call('coast',JSON.stringify(world)));});
assert(await page.evaluate(()=>window.__image===document.querySelector('.sprite-a image')));
await page.locator('[data-object="tree"]').hover();
await page.waitForFunction(()=>document.querySelector('#object-description p').textContent.includes('leafy tree'));
assert(await page.locator('#object-description').evaluate(el=>el.classList.contains('hover-popup')));
const popup=await page.locator('#object-description').boundingBox();
const tree=await page.locator('[data-object="tree"]').boundingBox();
assert(Math.abs(popup.y-tree.y)<180,'Hover popup should appear beside the object');
await page.locator('#close-description').click();
await page.locator('#add-item').click();
await page.locator('#item-picture summary').click();
await page.locator('#artifact-image').setInputFiles(require('node:path').join(__dirname,'site/assets/bold.webp'));
await page.waitForFunction(()=>document.querySelector('#image-note').textContent.includes('Picture ready'));
await page.locator('#artifact').fill('A coconut shell filled with fresh rainwater');
await page.locator('#place').click();
await page.locator('#world').click({position:{x:300,y:300}});
await page.waitForSelector('#player-art image',{timeout:15000});assert.equal(await page.locator('#player-art image').count(),1);
await page.locator('#player-art [data-object]').click();
await page.waitForFunction(()=>document.querySelector('#object-description p').textContent==='A coconut shell filled with fresh rainwater');
await page.locator('#close-description').click();
await page.locator('#add-item').click();
await page.locator('#item-picture summary').click();
await page.locator('#artifact-image').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});
await page.waitForFunction(()=>document.querySelector('#image-note').textContent.includes('Choose a PNG'));
await page.locator('#cancel-item').click();
await page.screenshot({path:'/tmp/nouls-living-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});
await page.locator('[data-object="water"]').click();
assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
await page.screenshot({path:'/tmp/nouls-living-mobile.png',fullPage:true});
await page.evaluate(async()=>{const w=structuredClone(world);w.entities=w.entities.filter(e=>!artwork.has(e.id));draw(await call('coast',JSON.stringify(w)));});assert.equal(await page.locator('#player-art image').count(),0);
await page.emulateMedia({reducedMotion:'reduce'});
const reduced=await page.evaluate(()=>{const w=structuredClone(world);w.tick++;w.creatures[0].pos.x+=1;motion.update(w);return {walking:motion.states.get('c1').el.dataset.walking,x:motion.states.get('c1').x,target:w.creatures[0].pos.x};});
assert.equal(reduced.walking,'false');assert.equal(reduced.x,reduced.target);assert.deepEqual(errors,[]);
await page.evaluate(async()=>{const w=structuredClone(world);w.creatures=w.creatures.map(c=>({...c,health:.001,thirst:1}));draw(await call('coast',JSON.stringify(w)));await selectCreature('c2');});
assert.equal(await page.locator('.noul.dead').count(),4);
assert((await page.locator('#current-thought').innerText()).includes('Died of dehydration'));
assert.deepEqual(await page.evaluate(async()=>(await call('whoDeliberates',JSON.stringify(world))).ids),[]);
const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const mobile=await touch.newPage();await mobile.goto(process.env.NOULS_PREVIEW_URL || 'http://127.0.0.1:8943/decisions/');
await mobile.waitForSelector('[data-object="tree"]',{timeout:120000});
await mobile.locator('[data-object="tree"]').tap();
assert(await mobile.locator('#object-description').isVisible());
assert(!(await mobile.locator('#object-description').evaluate(el=>el.classList.contains('hover-popup'))));
assert(!(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
await mobile.screenshot({path:'/tmp/nouls-survival-touch.png',fullPage:true});
// The primary mobile interaction pauses immediately and preserves the previous state.
await mobile.locator('#close-description').click();
await mobile.evaluate(async()=>{await rpc('configure',[],{mode:'simulate'});mode='simulate';running=true;}); // Actual offline physics; no paid calls.
await mobile.waitForFunction(()=>world.tick>0);
await mobile.locator('#add-item').tap();
assert.equal(await mobile.evaluate(()=>running),false);
await mobile.waitForFunction(()=>!busy);
const pausedTick=await mobile.evaluate(()=>world.tick);
await mobile.waitForTimeout(450);
assert.equal(await mobile.evaluate(()=>world.tick),pausedTick);
assert(await mobile.locator('#item-dialog').isVisible());
assert.equal(await mobile.locator('#artifact').evaluate(el=>getComputedStyle(el).fontSize),'16px');
await mobile.locator('[data-item]').first().tap();
await mobile.locator('#artifact').fill('A small bowl of sweet berries');
await mobile.screenshot({path:'/tmp/nouls-add-item-mobile.png'});
await mobile.locator('#place').tap();
assert.equal(await mobile.evaluate(()=>running),false);
assert(await mobile.locator('#placement-controls').isVisible());
assert(!(await mobile.locator('#item-dialog').isVisible()));
await mobile.locator('#edit-item').tap();
assert.equal(await mobile.locator('#artifact').inputValue(),'A small bowl of sweet berries');
await mobile.locator('#place').tap();
const beforeItems=await mobile.evaluate(()=>world.entities.length);
await mobile.locator('#place-center').tap();
await mobile.waitForFunction(()=>!addingItem);
assert.equal(await mobile.evaluate(()=>world.entities.length),beforeItems+1);
assert.equal(await mobile.evaluate(()=>running),true);
await mobile.waitForFunction(tick=>world.tick>tick,pausedTick);
await mobile.evaluate(()=>{running=false;mode='live';});
await mobile.waitForFunction(()=>!busy);
await mobile.locator('#add-item').tap();
await mobile.locator('#artifact').fill('A draft to keep');
await mobile.locator('#cancel-item').tap();
assert.equal(await mobile.evaluate(()=>running),false);
await mobile.locator('#add-item').tap();
assert.equal(await mobile.locator('#artifact').inputValue(),'A draft to keep');
await mobile.locator('#place').tap();
await mobile.screenshot({path:'/tmp/nouls-place-item-mobile.png'});
await mobile.locator('#cancel-placement').tap();
assert.equal(await mobile.evaluate(()=>world.entities.length),beforeItems+1);
assert.equal(await mobile.evaluate(()=>running),false);
assert(!(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
console.log('PASS mobile item sheet, pause, edit, centre placement, resume, draft retention and cancel');
// Synthetic relay response only; the actual AILANG addNoul adapter still runs.
const profile={version:1,name:'Pip',description:'A brave fast explorer who tires easily.',appearance:'curious',actThreshold:.4,presentAt:.8,cadence:12,speed:1.4,stamina:.6};
await mobile.route('https://openrouter.ai/api/alpha/decisions',route=>route.fulfill({json:require('./test-provider-fixture.cjs')(route.request().postDataJSON())}));
await mobile.evaluate(async()=>{liveKey='test-only-not-a-real-key';const s=await (await publicTransport.request('api/session')).json();liveSession=s.session;sessionBudget=s.budget;});
await mobile.locator('#create-noul').click();await mobile.locator('#character-name').fill('Pip');
await mobile.locator('#character-description').fill(profile.description);await mobile.locator('#design-character').click();
await mobile.locator('#character-preview').waitFor({state:'visible'});
assert((await mobile.locator('#proposed-traits').innerText()).includes('1.40×'));
assert(!(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
await mobile.screenshot({path:'/tmp/nouls-character-mobile.png',fullPage:true});
await mobile.locator('#add-character').click();await mobile.locator('#character-dialog').waitFor({state:'hidden'});
assert.equal(await mobile.locator('.noul').count(),5);assert.equal(await mobile.locator('#creature-name').innerText(),'Pip');
assert((await mobile.locator('#character-traits').innerText()).includes('1.40×'));
assert.equal(await mobile.evaluate(()=>JSON.parse(world.creatures.at(-1).profile).description),profile.description);
await mobile.screenshot({path:'/tmp/nouls-character-added-mobile.png',fullPage:true});// A synthetic saved decision drives the real AILANG social policy and UI.
await mobile.evaluate(async()=>{
 running=false;const snapshot=JSON.stringify(world);const percept=await call('perceptOf',snapshot,'c2');
 const choice=(key,ps)=>({kind:'ChoiceA',choice:key,confidence:1,probabilities:ps});
 const row={tick:world.tick,creatureId:'c2',soul:'bold',source:'synthetic',roll:.5,
  state:JSON.stringify(percept.state),questions:'[]',note:'Synthetic social browser regression',
  decision:JSON.stringify({model:'synthetic-social-test',id:'browser-social',input_tokens:0,output_tokens:0,cost_usd:0,answers:[
   {name:'behavior',answer:choice('socialize',[{key:'socialize',p:1}])},
   {name:'companion',answer:choice('c1',[{key:'c1',p:.6},{key:'c4',p:.3},{key:'alone',p:.1}])},
   {name:'avoid_companion',answer:choice('none',[{key:'none',p:.7},{key:'c3',p:.3}])}]}),
  action:JSON.stringify({tag:'Do',intent:{tag:'Socialize',id:'c4'}})};
 rows=[row];await selectCreature('c2');await showRow(0);
 draw(await call('enact',snapshot,JSON.stringify(row)));
});
assert((await mobile.locator('#social-preferences').innerText()).includes('adventurous'));
assert((await mobile.locator('#social-choices').innerText()).includes('Wary Noul'));
assert((await mobile.locator('#social-choices').innerText()).includes('60%'));
assert((await mobile.locator('#outcome').innerText()).includes('Socialize: Curious Noul'));
assert((await mobile.locator('#social-encounter').innerText()).includes('Curious Noul'));
assert.equal(await mobile.locator('.noul[data-id="c2"] .thought text').textContent(),'company');
assert.equal(await mobile.locator('.social-distribution .bar-row').count(),5);
assert(!(await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth)));
await mobile.screenshot({path:'/tmp/nouls-social-mobile.png',fullPage:true});
await mobile.setViewportSize({width:1440,height:1080});
await mobile.screenshot({path:'/tmp/nouls-social-desktop.png',fullPage:true});
await mobile.locator('#creature-tabs button').filter({hasText:'Wary'}).click();
await mobile.waitForFunction(()=>!document.querySelector('#social-choices').textContent.includes('60%'));
assert(!(await mobile.locator('#social-choices').innerText()).includes('60%'));
assert((await mobile.locator('#social-preferences').innerText()).includes('calm'));
assert.deepEqual(await mobile.evaluate(()=>world.creatures.find(c=>c.id==='c2').intent),{tag:'Socialize',id:'c4'});
await touch.close();
console.log('PASS names above creatures, social preference distributions, sampled peer action, current intent and switching inspectors');
console.log('PASS pointer popup, touch popup, death display and stopped judgments; interpolation, yaw and gait, image identity, semantic hover/tap, image placement, invalid upload rejection, mobile overflow, reduced motion');
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
