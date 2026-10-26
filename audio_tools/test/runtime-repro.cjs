// Minimal released-runtime observations. Failure is recorded as failure, not pass.
const fs=require('node:fs'),path=require('node:path');globalThis.crypto=require('node:crypto').webcrypto;
const artifact=path.resolve(process.env.AUDIO_ARTIFACT||'/private/tmp/audio-demo-site/audio-tools');require(path.join(artifact,'wasm/wasm_exec.js'));
(async()=>{
 const go=new Go();const {instance}=await WebAssembly.instantiate(fs.readFileSync(path.join(artifact,'wasm/ailang.wasm')),go.importObject);go.run(instance);
 const fixtures=[
 ['demo/foo','module demo/foo\nexport pure func f(x: int) -> int { x + 1 }\n'],
 ['demo/bar','module demo/bar\nimport ./foo (f)\nexport pure func g(x: int) -> int { f(x) }\n'],
 ['demo/model','module demo/model\nexport type Layout = MyMono | MyStereo deriving (Eq)\nexport pure func ident(x: Layout) -> Layout { x }\n'],
 ['demo/client','module demo/client\nimport demo/model (Layout)\nexport pure func same(a: Layout, b: Layout) -> bool { a == b }\n']
 ];
 const results=fixtures.map(([name,source])=>({name,source,...ailangLoadModule(name,source)}));
 const report={runtime:'v0.54.18',runtimeArchiveSha256:'e375ec1127ecc0d5d4f3b2f0775aa321d35dcc3a07f5a9a19f7857b618b160b0',results};
 const out=path.resolve(__dirname,'../evidence/runtime-repro.json');fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));process.exit(results.every(r=>r.success)?0:1);
})().catch(e=>{console.error(e);process.exit(1)});
