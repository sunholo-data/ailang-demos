// Pinned AILANG performs every synthesis, effect, measurement and codec operation.
let initialized,busy=false;
const checkedBytes=async(path,limit)=>{
 const response=await fetch(new URL(path,self.location.href),{signal:AbortSignal.timeout(90000)});
 if(!response.ok)throw Error(`Missing audio engine asset: ${path}`);
 const data=new Uint8Array(await response.arrayBuffer());
 if(data.byteLength>limit)throw Error('Audio engine asset exceeds its size limit');
 return data;
};
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function initialize(){
 postMessage({type:'progress',message:'Loading the audio engine…'});
 const meta=await (await fetch(new URL('build.json',self.location.href))).json();
 importScripts(new URL('wasm/wasm_exec.js',self.location.href).href);
 const go=new Go();const bytes=await checkedBytes('wasm/ailang.wasm',50000000);
 if(await hash(bytes)!==meta.wasmSha256)throw Error('Audio engine integrity check failed');
 const {instance}=await WebAssembly.instantiate(bytes,go.importObject);go.run(instance);
 self.ailangSetTypeCheckBudget(20000);
 const modules=await (await fetch(new URL('modules.json',self.location.href))).json();
 for(const entry of modules){
  postMessage({type:'progress',message:'Preparing the sound tools…'});
  const source=await checkedBytes(entry.path,512000);
  if(await hash(source)!==entry.sha256)throw Error('Audio module integrity check failed');
  const loaded=self.ailangLoadModule(entry.name,new TextDecoder().decode(source));
  if(!loaded.success)throw Error(`${entry.name}: ${loaded.error}`);
 }
 const probe=await self.ailangCallAsync('host','probe',0);
 if(!probe.success||probe.result!==true)throw Error('Audio processing self-check failed');
 return meta;
}
onmessage=async({data})=>{
 let ownsJob=false;
 try{
  if(!initialized)initialized=initialize();
  const meta=await initialized;
  if(data.type==='init'){postMessage({type:'ready',runtime:meta.runtime});return;}
  if(data.type!=='render'||!Number.isSafeInteger(data.id)||!['tone','pluck','noise'].includes(data.preset)||typeof data.echo!=='boolean')throw Error('Invalid audio request');
  if(busy)throw Error('An audio job is already running');
  busy=true;ownsJob=true;
  const started=performance.now();
  const result=await self.ailangCallAsync('host','render',data.preset,data.echo);
  if(!result.success)throw Error(result.error);
  if(result.result?._ctor!=='Ok')throw Error('The checked audio pipeline rejected this sound');
  const out=result.result._fields[0];
  if(!(out.original instanceof Uint8Array)||!(out.processed instanceof Uint8Array)||out.processed.byteLength>60044||out.original.byteLength>60044)throw Error('Unexpected audio output');
  postMessage({type:'result',id:data.id,original:out.original,processed:out.processed,report:JSON.parse(out.report),preparationMs:performance.now()-started},[out.original.buffer,out.processed.buffer]);
 }catch(error){postMessage({type:'error',id:data.id,message:error.message});}
 finally{if(ownsJob)busy=false;}
};
