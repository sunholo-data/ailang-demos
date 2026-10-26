// Real released Go/WASM runtime: this test deliberately fails on a loader gap.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const artifact=path.resolve(process.env.AUDIO_ARTIFACT||'/private/tmp/audio-demo-site/audio-tools');
globalThis.crypto=crypto.webcrypto;require(path.join(artifact,'wasm/wasm_exec.js'));
(async()=>{
 const go=new Go();const {instance}=await WebAssembly.instantiate(fs.readFileSync(path.join(artifact,'wasm/ailang.wasm')),go.importObject);go.run(instance);ailangSetTypeCheckBudget(20000);
 const modules=JSON.parse(fs.readFileSync(path.join(artifact,'modules.json'),'utf8'));
 for(const entry of modules){const source=fs.readFileSync(path.join(artifact,entry.path));assert.equal(crypto.createHash('sha256').update(source).digest('hex'),entry.sha256);const r=ailangLoadModule(entry.name,source.toString());assert.equal(r.success,true,`${entry.name}: ${r.error}`);}
 const probe=await ailangCallAsync('host','probe',0);assert.equal(probe.success,true,probe.error);assert.equal(probe.result,true);
 const native=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../evidence/native-fixtures.json'),'utf8'));
 for(const preset of ['tone','pluck','noise'])for(const echo of [false,true]){
  const begin=performance.now();const result=await ailangCallAsync('host','render',preset,echo);assert.equal(result.success,true,result.error);assert.equal(result.result._ctor,'Ok');const out=result.result._fields[0];assert(out.original instanceof Uint8Array);assert(out.processed instanceof Uint8Array);
  const fixture=native[`${preset}-${echo}`];assert.deepEqual(Buffer.from(out.original),Buffer.from(fixture.original,'base64'));assert.deepEqual(Buffer.from(out.processed),Buffer.from(fixture.processed,'base64'));assert.deepEqual(JSON.parse(out.report),JSON.parse(fixture.report));console.log(`PASS real WASM ${preset} echo=${echo} ${(performance.now()-begin).toFixed(1)}ms`);
 }
 console.log('PASS real released WASM, six native byte pins and binary bridge');process.exit(0);
})().catch(error=>{console.error(error);process.exit(1);});
