// Worker ownership and deadlines only. No audio processing lives in this module.
export class AudioEngine {
 constructor({createWorker,onState=()=>{},onProgress=()=>{},onResult=()=>{},startupMs=120000,jobMs=30000}){Object.assign(this,{createWorker,onState,onProgress,onResult,startupMs,jobMs});this.worker=null;this.id=0;this.state='stopped';}
 update(state,message=''){this.state=state;this.onState(state,message);}
 boot(){
  this.close();const worker=this.createWorker();this.worker=worker;this.update('loading');
  this.timer=setTimeout(()=>this.fail(worker,'Audio engine startup timed out'),this.startupMs);
  worker.onmessage=event=>this.receive(worker,event.data);
  worker.onerror=()=>this.fail(worker,'Audio worker stopped unexpectedly');
  worker.postMessage({type:'init'});
 }
 generate(preset,echo){
  if(!['tone','pluck','noise'].includes(preset)||typeof echo!=='boolean')throw Error('Invalid sound selection');
  if(this.state!=='ready'){this.pending={preset,echo};if(this.state!=='loading'){const pending=this.pending;this.boot();this.pending=pending;}return;}
  const id=++this.id;this.update('rendering');const worker=this.worker;
  this.timer=setTimeout(()=>this.fail(worker,'Sound preparation timed out'),this.jobMs);
  worker.postMessage({type:'render',id,preset,echo});
 }
 async receive(worker,data){
  if(worker!==this.worker)return;
  if(data.type==='progress'){if(this.state==='loading')this.onProgress(data.message);return;}
  if(data.type==='error'){if(data.id===undefined||data.id===this.id)this.fail(worker,data.message);return;}
  if(data.type==='ready'&&this.state==='loading'){
   clearTimeout(this.timer);this.update('ready');
   if(this.pending){const request=this.pending;this.pending=null;this.generate(request.preset,request.echo);}return;
  }
  if(data.type!=='result'||this.state!=='rendering'||data.id!==this.id)return;
  const id=data.id;const current=()=>worker===this.worker&&id===this.id&&this.state==='rendering';
  try{await this.onResult(data,current);if(current()){clearTimeout(this.timer);this.update('ready');}}
  catch(error){if(current())this.fail(worker,error.message);}
 }
 fail(worker,message){if(worker!==this.worker)return;this.close();this.update('error',message);}
 close(){clearTimeout(this.timer);this.worker?.terminate();this.worker=null;this.pending=null;this.id++;}
 stop(){this.close();this.update('stopped');}
 dispose(){this.close();}
}
