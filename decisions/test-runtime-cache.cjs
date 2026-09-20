// Verifies actual worker/browser persistence, not only server response headers.
const {chromium}=require('../scripts/smoke/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});try{
 const page=await browser.newPage();const requests=[],statuses=[];
 page.context().on('request',async r=>{if(r.url().endsWith('/wasm/ailang.wasm'))requests.push(await r.allHeaders());});
 page.context().on('response',r=>{if(r.url().endsWith('/wasm/ailang.wasm'))statuses.push(r.status());});
 await page.goto(process.env.NOULS_PREVIEW_URL||'https://voights-mac-studio.tail97eda0.ts.net:8443/decisions/');
 await page.waitForFunction(()=>document.querySelector('#runtime').textContent.includes('ready'),{timeout:120000});
 assert(await page.evaluate(async()=>Boolean((await (await caches.open('ailang-runtime-v1')).match(new URL('wasm/ailang.wasm',location.href).href))?.headers.get('ETag'))));
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#runtime').textContent.includes('ready'),{timeout:120000});
 assert.equal(requests.length,2);assert(requests[1]['if-none-match']);assert.deepEqual(statuses,[200,304]);
 assert.equal(await page.locator('.noul').count(),4);
 console.log('PASS first WASM load 200; second load sends saved ETag, receives body-free 304 and boots four Nouls from browser storage');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1);});
