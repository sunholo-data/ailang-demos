const {test}=require('node:test'),assert=require('node:assert/strict');
const Transport=require('./site/transport.js');
const ok=(cost=.001)=>new Response(JSON.stringify({usage:{cost},answers:{}}),{headers:{'Content-Type':'application/json'}});
const call=async fn=>fn.startsWith('prepare')?{ok:true,body:'{"model":"test"}'}:{ok:true,row:{decision:'{}'}};
async function setup(fetcher,handler=call){const t=new Transport(handler,fetcher);const s=await(await t.request('api/session')).json();return {t,s:s.session};}
const opts=(session,extra={})=>({headers:{'X-Nouls-Key':'test-private-key'},body:JSON.stringify({session,world:'{}',id:'c1',completed:0,...extra})});
test('network receives key only at OpenRouter; AILANG receives no credential',async()=>{
 const args=[];const {t,s}=await setup(async(url,o)=>{assert.equal(url,'https://openrouter.ai/api/alpha/decisions');assert.equal(o.headers.Authorization,'Bearer test-private-key');assert(!o.body.includes('test-private-key'));return ok();},async(...a)=>{args.push(a);return call(a[0]);});
 const r=await(await t.request('api/decision',opts(s))).json();assert(r.ok);assert.equal(r.sessionCost,.001);assert(!JSON.stringify(args).includes('test-private-key'));
});
test('one in-flight request per tab session; independent sessions do not block',async()=>{
 let release;const {t,s}=await setup(()=>new Promise(r=>release=r));const pending=t.request('api/decision',opts(s));while(!release)await new Promise(r=>setImmediate(r));
 assert.equal((await t.request('api/decision',opts(s))).status,429);
 const second=await(await t.request('api/session')).json();t.fetcher=async()=>ok(.002);
 assert((await(await t.request('api/decision',opts(second.session))).json()).ok);
 release(ok(.001));await pending;assert.equal(t.sessions.get(s).spent,.001);assert.equal(t.sessions.get(second.session).spent,.002);
});
test('unknown usage prevents a second billed call',async()=>{
 let calls=0;const {t,s}=await setup(async()=>{calls++;return new Response('{}');});await t.request('api/decision',opts(s));assert.equal((await t.request('api/decision',opts(s))).status,402);assert.equal(calls,1);
});
test('response parse failure stops uncertain spending',async()=>{
 const {t,s}=await setup(async()=>new Response('not JSON'));const r=await(await t.request('api/decision',opts(s))).json();assert(!r.ok);assert.equal(r.sessionCost,.1);
});
test('authentication rejection permits correction without consuming budget',async()=>{
 const {t,s}=await setup(async()=>new Response('{}',{status:401}));assert(!(await(await t.request('api/decision',opts(s))).json()).ok);assert.equal(t.sessions.get(s).spent,0);
});
test('AILANG rejection after provider success retains billed cost',async()=>{
 const {t,s}=await setup(async()=>ok(.003),async fn=>{if(fn.startsWith('complete'))throw Error('MissingAnswer');return call(fn);});const r=await(await t.request('api/decision',opts(s))).json();assert(!r.ok);assert.equal(r.sessionCost,.003);
});
test('pre-cancelled requests spend nothing and never fetch',async()=>{
 let calls=0;const {t,s}=await setup(async()=>{calls++;return ok();});await t.request('api/decision',{...opts(s),signal:AbortSignal.abort()});assert.equal(calls,0);assert.equal(t.sessions.get(s).spent,0);
});
test('artwork reserves estimated cost and shares decision spending cap',async()=>{
 let calls=0;const {t,s}=await setup(async()=>{calls++;return ok(.09);});await t.request('api/decision',opts(s));assert.equal((await t.request('api/image',opts(s,{description:'an orange bowl'}))).status,402);assert.equal(calls,1);
});
test('oversized provider stream stops safely',async()=>{
 const {t,s}=await setup(async()=>new Response('x',{headers:{'content-length':'99999999'}}));const r=await(await t.request('api/decision',opts(s))).json();assert(!r.ok);assert.equal(r.sessionCost,.1);
});
