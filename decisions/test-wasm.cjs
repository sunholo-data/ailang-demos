// Real Go/WASM integration, no mock simulation or model responses.
// Run from repo root: node decisions/test-wasm.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
process.chdir(root);
globalThis.crypto = require('node:crypto').webcrypto;
globalThis.self = globalThis;
require(path.join(root, 'wasm/wasm_exec.js'));
(async () => {
  const go = new Go();
  const {instance} = await WebAssembly.instantiate(fs.readFileSync('wasm/ailang.wasm'), go.importObject);
  go.run(instance);
  ailangSetTypeCheckBudget(8000);
  for (const [name,file] of [['pkg/sunholo/decisions/decide','../ailang-packages/packages/decisions/decide.ail'], ...['world','souls','render','oracle','bank','host'].map(n=>[n,`decisions/${n}.ail`])]) {
    const loaded = ailangLoadModule(name, fs.readFileSync(file,'utf8'));
    assert.equal(loaded.success,true,`${name}: ${loaded.error}`);
    console.log(`PASS load ${name} (${loaded.typeCheckMs || '?'} ms)`);
  }
  async function call(fn,...args) {
    const result = await ailangCallAsync('host',fn,...args);
    assert.equal(result.success,true,`${fn}: ${result.error}`);
    return fn==='seed' ? result.result : JSON.parse(result.result);
  }
  const initial = await call('init');
  assert.equal(initial.world.creatures.length,4);
  assert.match(initial.svg,/role="button"/);
  fs.writeFileSync('/tmp/nouls-world.svg',initial.svg);
  const state = JSON.stringify(initial.world);
  const row = JSON.parse(fs.readFileSync('decisions/bank/synthetic.jsonl','utf8'));
  const review = await call('review',JSON.stringify(row));
  assert.equal(review.verified,true);
  assert.equal(review.sample,'forage');
  assert.deepEqual(review.action,{tag:'Do',intent:{tag:'Approach',id:'e9'}});
  assert.match(review.bars,/prob-segment/);
  assert.equal((await call('review',JSON.stringify({...row,action:'{"tag":"Idle"}'}))).verified,false);
  assert.equal((await call('enact',state,JSON.stringify({...row,action:'{"tag":"Idle"}'}))).ok,false);
  assert.equal((await call('review','invalid')).ok,false);
  console.log('PASS replay, distribution, divergence and malformed bank');
  ailangGrantCapability('Rand');
  async function run() { await call('seed',7); let w=state; for(let i=0;i<30;i++) { const f=await call('tick',w);assert.equal(f.ok,true);w=JSON.stringify(f.world); } return w; }
  const advanced=await run();assert.equal(advanced,await run());
  const applied=await call('applyDecision',advanced,state,JSON.stringify(row));
  assert.equal(applied.world.tick,31);
  assert.equal(applied.world.creatures.find(c=>c.id==='c2').lastDeliberation,30);
  console.log('PASS seeded WASM simulation determinism (30 ticks twice)');
  const cornerWorld=JSON.parse(state);
  cornerWorld.creatures=cornerWorld.creatures.map(c=>({...c,pos:{x:59,y:59},heading:0.7,intent:{tag:'Wander'}}));
  let moving=JSON.stringify(cornerWorld);
  let previousX=59, previousY=59, still=0;
  for(let i=0;i<120;i++){
    const frame=await call('coast',moving);
    for(const c of frame.world.creatures){
      assert(c.pos.x>=3&&c.pos.x<=57&&c.pos.y>=3&&c.pos.y<=57);
    }
    const c=frame.world.creatures[0];
    still=c.pos.x===previousX&&c.pos.y===previousY?still+1:0;
    assert(still<3,'Wandering creature became pinned at a boundary');
    previousX=c.pos.x;previousY=c.pos.y;moving=JSON.stringify(frame.world);
  }
  const resting=JSON.parse(state);
  resting.creatures[0].intent={tag:'Rest'};
  const rested=await call('coast',JSON.stringify(resting));
  assert.deepEqual(rested.world.creatures[0].pos,resting.creatures[0].pos);
  assert(rested.world.creatures[0].energy>resting.creatures[0].energy);
  console.log('PASS WASM resting and 120-tick unpinned boundary movement');

  const placed=await call('addEntity',state,'<script>alert("x")</script>','12','18');
  assert.equal(placed.ok,true);
  assert.equal(placed.world.entities.length,initial.world.entities.length+1);
  assert(!placed.svg.includes('<script>'));
  assert(placed.svg.includes('&lt;script&gt;'));
  assert.equal((await call('addEntity',state,'egg','-1','18')).ok,false);
  assert.equal((await call('addEntity',state,'','12','18')).ok,false);
  const due=await call('whoDeliberates',JSON.stringify(placed.world));
  assert(due.ids.includes('c1'));
  assert.equal((await call('perceptOf',state,'c2')).ok,true);
  assert.equal((await call('perceptOf',state,'unknown')).ok,false);
  console.log('PASS placement, escaping, perception and deliberation trigger');
  // Synthetic answers exercise real policy + bank replay + WASM execution;
  // these are not represented as live provider judgments.
  for(const [mode,tag,need] of [['eat','Eat','hunger'],['drink','Drink','thirst'],['toilet','Toilet','bowel']]) {
    const w=JSON.parse(state);const c=w.creatures.find(c=>c.id==='c2');
    const id='player-defined-'+mode;
    w.entities.push({id,kind:'stone',desc:'A player-described object',pos:{...c.pos}});
    const choice=(name,key)=>({name,answer:{kind:'ChoiceA',choice:key,confidence:1,probabilities:[{key,p:1}]}});
    const action={tag:'Do',intent:{tag,id}};
    const probe={...row,source:'synthetic',decision:JSON.stringify({...JSON.parse(row.decision),answers:[choice('behavior',mode),choice(mode+'_target',id)]}),action:JSON.stringify(action)};
    const result=await call('applyDecision',JSON.stringify(w),JSON.stringify(w),JSON.stringify(probe));
    assert.equal(result.ok,true);
    const after=result.world.creatures.find(v=>v.id==='c2');
    assert(after[need]<c[need]);
    if(mode==='eat')assert(!result.world.entities.some(e=>e.id===id));
    assert.match(result.svg,/-walk\.webp/);
  }
  console.log('PASS WASM model-selected player objects satisfy all three needs');
  const survivalDecision={...JSON.parse(row.decision),answers:[
    {name:'behavior',answer:{kind:'ChoiceA',choice:'drink',confidence:.45,probabilities:[{key:'drink',p:1}]}},
    {name:'drink_target',answer:{kind:'ChoiceA',choice:'player-cup',confidence:.8,probabilities:[{key:'player-cup',p:1}]}}
  ]};
  const urgentRow={...row,soul:'paranoid',source:'synthetic',state:JSON.stringify({policyVersion:2,urgency:1}),decision:JSON.stringify(survivalDecision),action:JSON.stringify({tag:'Do',intent:{tag:'Drink',id:'player-cup'}})};
  const urgentReview=await call('review',JSON.stringify(urgentRow));
  assert.equal(urgentReview.verified,true);assert.equal(urgentReview.threshold,.25);
  const legacyReview=await call('review',JSON.stringify({...urgentRow,state:'{}',action:JSON.stringify({tag:'Hesitate'})}));
  assert.equal(legacyReview.verified,true);assert.equal(legacyReview.threshold,.9);
  console.log('PASS WASM urgent and legacy gates replay with their banked policy');


  const profile={version:1,name:'Pip <script>',description:'A fast brave explorer who tires quickly.',appearance:'curious',actThreshold:.4,presentAt:.8,cadence:12,speed:1.4,stamina:.6};
  let created=await call('addNoul',state,JSON.stringify(profile));
  assert.equal(created.world.creatures.length,5);assert.equal(created.world.creatures[4].id,'c5');
  assert(!created.svg.includes('Pip <script>'));assert(created.svg.includes('Pip &lt;script&gt;'));
  const custom=created.world.creatures[4];
  const customPerception=await call('perceptOf',JSON.stringify(created.world),'c5');
  assert.equal(JSON.parse(customPerception.state.profile).speed,1.4);
  assert.equal(customPerception.threshold,.4);
  for(let i=0;i<3;i++)created=await call('addNoul',JSON.stringify(created.world),JSON.stringify({...profile,name:'Pip '+i}));
  assert.equal(created.world.creatures.length,8);
  assert.equal((await call('addNoul',JSON.stringify(created.world),JSON.stringify(profile))).ok,false);
  assert.equal((await call('addNoul',state,JSON.stringify({...profile,appearance:'invalid'}))).ok,false);
  const customRow={...urgentRow,creatureId:'c5',soul:'curious',state:JSON.stringify({...customPerception.state,urgency:0})};
  const customReview=await call('review',JSON.stringify(customRow));
  assert.equal(customReview.threshold,.4);assert.equal(customReview.verified,true);
  const restored=await call('restoreNoul',state,JSON.stringify({...customRow,creatureId:'c7'}));
  assert.equal(restored.world.creatures.at(-1).id,'c7');
  const nextCustom=await call('addNoul',JSON.stringify(restored.world),JSON.stringify(profile));
  assert.equal(nextCustom.world.creatures.at(-1).id,'c5');
  assert.equal((await call('restoreNoul',state,JSON.stringify({...customRow,state:'{}'}))).ok,false);
  console.log('PASS WASM player creation, bounded count, escaping, profile perception and custom bank replay');

  for(const cap of ['Net','Env']) ailangGrantCapability(cap);
  ailangSetEffectHandler('Env',{getEnv:name=>({_ctor:'Err',_fields:[{_ctor:'NotFound',_fields:[name]}]})});
  const missing=await call('deliberateLive',state,'c2',0);
  assert.equal(missing.ok,false);
  assert.match(missing.error,/key/i);
  const continued=await call('deliberateLive',state,'c2',24);
  assert.equal(continued.ok,false);assert.match(continued.error,/key/i);
  const invalid=await call('deliberateLive',state,'c2',-1);
  assert.equal(invalid.ok,false);assert.match(invalid.error,/count/);
  console.log('PASS tagged Env bridge, missing-key path and continuous sessions and counter validation');
  process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
