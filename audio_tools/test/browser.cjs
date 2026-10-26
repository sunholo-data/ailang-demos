// UI checks may use a clearly labelled native-fixture worker; real mode always
// exercises the released Go/WASM worker and is a separate acceptance gate.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require('../../scripts/smoke/node_modules/playwright');
const root=path.resolve(__dirname,'../..'),base=process.env.AUDIO_PREVIEW_URL||'http://127.0.0.1:8984/audio-tools/';
const fixtureMode=process.env.AUDIO_UI_FIXTURES==='1';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:1000}});
 let fixtures;
 if(fixtureMode){fixtures=JSON.parse(fs.readFileSync(path.join(root,'audio_tools/evidence/native-fixtures.json'),'utf8'));await context.route('**/audio-tools/worker.js',route=>route.fulfill({contentType:'text/javascript',body:`const fixtures=${JSON.stringify(fixtures)};onmessage=({data})=>{if(data.type==='init'){postMessage({type:'ready'});return;}const f=fixtures[data.preset+'-'+data.echo];const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));setTimeout(()=>{const original=bytes(f.original),processed=bytes(f.processed);postMessage({type:'result',id:data.id,original,processed,report:JSON.parse(f.report),preparationMs:1},[original.buffer,processed.buffer]);},100);};`}));}
 const page=await context.newPage();const errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).origin!==new URL(base).origin)external.push(r.url());});
 await page.goto(base);await page.waitForFunction(()=>window.__demoReady||window.__demoError,null,{timeout:120000});
 const failure=await page.evaluate(()=>window.__demoError);assert.equal(failure,null,`Real WASM boot failed: ${failure}`);
 assert.equal(await page.locator('#make').isEnabled(),true);assert.equal(await page.locator('#processed').isEnabled(),false);
 for(const preset of ['tone','pluck','noise']){
  for(const echo of [false,true]){
   await page.locator(`input[value=${preset}]`).check();await page.locator('#echo').setChecked(echo);await page.locator('#make').click();
   await page.waitForFunction(({preset,echo})=>window.__audioDemoReport?.preset===preset&&window.__audioDemoReport.echo===echo&& !document.getElementById('make').disabled,{preset,echo},{timeout:60000});
   const r=await page.evaluate(()=>window.__audioDemoReport);assert.equal(r.frames,echo?21600:15600);assert(r.peak>0&&r.peak<=.25);
   if(fixtures){const expected=JSON.parse(fixtures[`${preset}-${echo}`].report);assert.equal(r.wavSha256,expected.wavSha256);}
  }
 }
 await page.locator('#original').click();await page.locator('#stop').click();await page.locator('#processed').click();await page.locator('#stop').click();
 const download=page.waitForEvent('download');await page.locator('#download').click();const file=await download;const bytes=fs.readFileSync(await file.path());const r=await page.evaluate(()=>window.__audioDemoReport);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),r.wavSha256);assert.equal(bytes.length,r.wavBytes);assert.equal(bytes.toString('ascii',0,4),'RIFF');
 // Stop a new job and recover; an old result must not overwrite the last accepted report.
 await page.locator('input[value=tone]').check();await page.evaluate(()=>{document.getElementById('make').click();document.getElementById('stop').click();});
 await page.waitForTimeout(200);assert.equal((await page.evaluate(()=>window.__audioDemoReport)).preset,'noise');
 await page.locator('#make').click();await page.waitForFunction(()=>window.__audioDemoReport?.preset==='tone'&&!document.getElementById('make').disabled,null,{timeout:120000});
 const shots=path.join(root,'audio_tools/evidence/screenshots');fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,fixtureMode?'desktop-ui-fixture.png':'desktop-real-wasm.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(shots,fixtureMode?'mobile-ui-fixture.png':'mobile-real-wasm.png'),fullPage:true});
 assert.equal(await page.locator('a.loop-link').getAttribute('href'),'https://github.com/sunholo-data/ailang-loop-lab#run-locally');assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 console.log(`PASS ${fixtureMode?'UI using generated native-fixture worker (not WASM acceptance)':'REAL pinned WASM browser'}: six presets, generation, A/B controls, stop/retry, byte-identical WAV download, mobile layout, no external requests`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
