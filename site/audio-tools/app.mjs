import {AudioEngine} from './controller.mjs';
const $=id=>document.getElementById(id);
let current=null,ctx=null,playing=null,playbackRevision=0;
const status=(text,error=false)=>{$('status').textContent=text;$('status').dataset.error=String(error);};
function stopPlayback(){playbackRevision++;if(playing){try{playing.stop();}catch{}playing.disconnect();playing=null;}}
function clearOutput(){if(current){URL.revokeObjectURL(current.originalUrl);URL.revokeObjectURL(current.processedUrl);}current=null;$('download').removeAttribute('href');$('download').setAttribute('aria-disabled','true');$('download').tabIndex=-1;}
function controls(state){
 const busy=state==='rendering'||state==='loading';$('make').disabled=busy;
 $('original').disabled=!current||busy;$('processed').disabled=!current||busy;
 $('retry').hidden=state!=='error';
 $('download').setAttribute('aria-disabled',String(!current||busy));$('download').tabIndex=current&&!busy?0:-1;
}
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
function wav(bytes,report){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<44||bytes.byteLength>60044)throw Error('Invalid WAV size');
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);const tag=n=>String.fromCharCode(...bytes.slice(n,n+4));
 if(tag(0)!=='RIFF'||tag(8)!=='WAVE'||tag(12)!=='fmt '||tag(36)!=='data'||d.getUint32(16,true)!==16||d.getUint16(20,true)!==1||d.getUint16(22,true)!==1||d.getUint32(24,true)!==24000||d.getUint16(34,true)!==16||d.getUint32(40,true)!==report.frames*2||d.getUint32(4,true)!==bytes.byteLength-8||bytes.byteLength!==44+report.frames*2)throw Error('Unexpected delivered WAV format');
 return d;
}
function draw(bytes,report){
 const d=wav(bytes,report);let path='';
 for(let i=0;i<500;i++){const start=Math.floor(i*report.frames/500),end=Math.max(start+1,Math.floor((i+1)*report.frames/500));let peak=0;
  for(let j=start;j<end;j++)peak=Math.max(peak,Math.abs(d.getInt16(44+j*2,true)/32768));
  const height=Math.min(68,peak*250);path+=`M ${i*2} ${80-height} L ${i*2} ${80+height} `;
 }
 $('wave-path').setAttribute('d',path);$('waveform').setAttribute('aria-label',`${report.preset} waveform, ${report.echo?'with echo':'without echo'}`);
}
const engine=new AudioEngine({createWorker:()=>new Worker(new URL('./worker.js',import.meta.url)),
 onState:(state,message)=>{
  controls(state);
  if(state==='loading'){window.__demoReady=false;window.__demoError=null;status('Loading the audio engine…');}
  if(state==='ready'){window.__demoReady=true;window.__demoError=null;status(current?'Sound ready. Choose a version to listen.':'Choose a preset, then make a sound.');}
  if(state==='rendering'){stopPlayback();status('Making your sound…');}
  if(state==='error'){window.__demoError=message;window.__demoReady=false;status('The audio engine could not complete this request. Retry audio engine.',true);$('status').title=message;}
  if(state==='stopped'){window.__demoReady=false;status('Stopped. Make a sound to start again.');}
 },onProgress:message=>status(message),
 onResult:async(data,isCurrent)=>{
  const r=data.report;
  if(!r||r.schema!=='audio-tools-report/v1'||r.package!=='sunholo/audio@0.4.0'||!['tone','pluck','noise'].includes(r.preset)||typeof r.echo!=='boolean'||r.rate!==24000||r.channels!==1||!Number.isSafeInteger(r.frames)||r.frames<1||r.frames>30000||!Number.isFinite(r.peak)||r.peak<0||r.peak>0.250001)throw Error('Invalid processing report');
  wav(data.original,r);wav(data.processed,r);
  if(await sha(data.original)!==r.originalSha256||await sha(data.processed)!==r.wavSha256)throw Error('Audio byte identity mismatch');
  if(!isCurrent())return;
  stopPlayback();clearOutput();
  const originalUrl=URL.createObjectURL(new Blob([data.original],{type:'audio/wav'}));
  const processedUrl=URL.createObjectURL(new Blob([data.processed],{type:'audio/wav'}));
  current={...data,originalUrl,processedUrl};
  $('download').href=processedUrl;$('download').download=`ailang-${r.preset}${r.echo?'-echo':''}.wav`;
  $('result-name').textContent=r.preset[0].toUpperCase()+r.preset.slice(1);$('duration').textContent=`${(r.frames/r.rate).toFixed(2)} s`;
  $('peak').textContent=r.peak.toFixed(3);$('effect').textContent=r.echo?'Echo + short fade':'Short fade';$('measurements').hidden=false;
  $('wave-caption').textContent=`24 kHz mono · ${r.frames.toLocaleString()} frames`;draw(data.processed,r);
  window.__audioDemoReport={...r,preparationMs:data.preparationMs};
 }
});
async function play(which){
 if(!current)return;stopPlayback();const revision=playbackRevision;const snapshot=current;
 ctx??=new AudioContext();await ctx.resume();
 const bytes=snapshot[which];const buffer=await ctx.decodeAudioData(bytes.slice().buffer);
 if(revision!==playbackRevision||snapshot!==current)return;
 const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;gain.gain.value=0.7;source.connect(gain).connect(ctx.destination);
 playing=source;source.onended=()=>{source.disconnect();gain.disconnect();if(playing===source)playing=null;};source.start();status(`Playing ${which==='original'?'original':'processed'} ${snapshot.report.preset}.`);
}
$('make').onclick=()=>engine.generate(document.querySelector('input[name=preset]:checked').value,$('echo').checked);
$('original').onclick=()=>play('original').catch(()=>status('Playback could not start. Try again.',true));
$('processed').onclick=()=>play('processed').catch(()=>status('Playback could not start. Try again.',true));
$('stop').onclick=()=>{stopPlayback();if(['loading','rendering'].includes(engine.state))engine.stop();else status(current?'Playback stopped. Your WAV is still ready.':'Nothing is playing.');};
$('retry').onclick=()=>engine.boot();
window.addEventListener('pageshow',event=>{if(event.persisted){ctx=null;clearOutput();$('measurements').hidden=true;$('wave-path').setAttribute('d','M 0 80 L 1000 80');$('wave-caption').textContent='Your sound will appear here.';delete window.__audioDemoReport;engine.boot();}});
window.addEventListener('pagehide',()=>{engine.dispose();stopPlayback();clearOutput();ctx?.close();});
engine.boot();
