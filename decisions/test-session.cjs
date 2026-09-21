const {test}=require('node:test'),assert=require('node:assert/strict');
const Session=require('./site/session.js'),Feedback=require('./site/feedback.js');
const creature={id:'c1',name:'Pip',soul:'wary',pos:{x:10,y:10},hunger:.2,thirst:.3,bowel:.1,energy:.7,fear:.1,comfort:.6,health:1,identity:{total:0,experiences:[],beliefs:[]}};
const world={size:60,tick:20,creatures:[creature],entities:[{id:'e1',desc:'clean rainwater in a cup',pos:{x:20,y:20},carrier:''}]};
const bank=require('node:fs').readFileSync(__dirname+'/bank/synthetic.jsonl','utf8');
test('portable session preserves habitat, title and evidence without credential/approval fields',()=>{
 const saved=Session.pack(world,[JSON.parse(bank)],new Map([['e1','Rainwater cup']]),new Map(),[]),loaded=Session.read(JSON.stringify(saved));
 assert.deepEqual(loaded.world,world);assert.equal(loaded.titles[0][1],'Rainwater cup');assert.equal(loaded.rows.length,1);assert.equal(saved.session,undefined);assert.equal(saved.apiKey,undefined);assert.equal(saved.budget,undefined);
});
test('legacy JSONL remains evidence-only; empty full snapshots work',()=>{
 assert.equal(Session.read(bank).world,undefined);
 assert.equal(Session.read(JSON.stringify(Session.pack(world,[],new Map(),new Map(),[]))).rows.length,0);
 assert.throws(()=>Session.read(''));
});
test('reject malformed imports before replacing the current habitat',()=>{
 const saved=()=>Session.pack(structuredClone(world),[],new Map(),new Map(),[]);
 for(const mutate of [s=>s.world.size=Infinity,s=>s.world.creatures=[],s=>s.world.creatures[0].pos.x=-1,s=>s.version=999,s=>s.artwork=[['e1','https://untrusted/image.svg']],s=>s.titles=[['e1','x'.repeat(33)]],s=>s.world.creatures[0].health=NaN]){const s=saved();mutate(s);assert.throws(()=>Session.read(JSON.stringify(s)));}
});
test('reported outcomes require completed experience, with actual need changes',()=>{
 const previous=structuredClone(world),current=structuredClone(world);
 current.creatures[0].intent={tag:'Drink',id:'e1'};
 assert.deepEqual(Feedback.outcomes(previous,current),[]);
 current.creatures[0].thirst=.05;current.creatures[0].identity={total:1,experiences:[{serial:1,tick:21,text:'I drank rainwater'}],beliefs:[]};
 const [event]=Feedback.outcomes(previous,current);assert.equal(event.title,'I drank rainwater');assert.match(event.detail,/Thirst 30% → 5%/);
});
test('judgment shows stored distributions and confidence, not invented thoughts',()=>{
 const result=Feedback.judgment(JSON.parse(bank),{threshold:.6,explanation:'Policy explanation'});
 assert.match(result.detail,/62%/);assert.match(result.detail,/71%/);assert.equal(result.explanation,'Policy explanation');assert(result.facts.length>0);
});
