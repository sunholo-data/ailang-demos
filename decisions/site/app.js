'use strict';
const $ = s => document.querySelector(s);
let pendingArtwork=null, imageGeneration=0, imageBusy=false;
const artwork=new Map();
const artJobs=new Map();
let artworkWorld=0, artQueue=Promise.resolve();
let socialViewKey='';
const motion = new NoulMotion($('#world'));
const publicTransport = new NoulsTransport((fn,...args)=>call(fn,...args));
const colors = {wary:'#287a63',bold:'#bd3012',paranoid:'#7953a4',curious:'#2474a8'};
const flavors = {wary:'A careful step, then another.',bold:'A little courage goes a long way.',paranoid:'Something might be watching.',curious:'There is always something to discover.'};
let primary, liveKey='', liveSession='', sessionBudget=0, sessionCost=0;
let world, mode='live', selected='c2', rows=[], activeRow=0, review;
let running=false, busy=false, placing=false, epoch=0, evidence='state', liveCount=0;
let addingItem=false, resumeAfterItem=false, committingItem=false;
let livePending=false, resolvedDecision=null, lastLiveId=null;
function loadingProgress(message,completed){
  $('#runtime').textContent=message;
  const progress=$('#loading-progress');if(!progress||$('#habitat-loading').classList.contains('failed'))return;
  const stage=Math.max(0,Math.min(10,completed||0));
  progress.value=Math.max(progress.value,stage<=1?stage*35:35+(stage-1)*65/9);
  $('#loading-stage').textContent=message;
  $('#loading-count').textContent=`${Math.round(progress.value)}% ready`;
}
$('#loading-retry').onclick=()=>location.reload();
function createClient() {
  const worker = new Worker('worker.js?v=ailang-21');
  const pending = new Map();
  let nextId=0;
  worker.onmessage=({data})=>{
    if(data.progress){loadingProgress(data.progress,data.completed);return;}
    const request=pending.get(data.id);
    if(!request)return;
    clearTimeout(request.timer);pending.delete(data.id);
    data.error ? request.reject(new Error(data.error)) : request.resolve(data.result);
  };
  worker.onerror=event=>fail(new Error(event.message));
  return {
    request(fn,args=[],extra={}) {
      return new Promise((resolve,reject)=>{
        const id=++nextId;
        const timer=setTimeout(()=>{
          pending.delete(id);
          reject(new Error('The AILANG runtime timed out. Reset to restart it.'));
        },120000);
        pending.set(id,{resolve,reject,timer});
        worker.postMessage({id,fn,args,...extra});
      });
    },
    stop() {
      worker.terminate();
      for(const request of pending.values()){
        clearTimeout(request.timer);request.reject(new Error('Session changed'));
      }
      pending.clear();
    }
  };
}
function rpc(fn,args=[],extra={}) { return primary.request(fn,args,extra); }
function startWorker() {
  primary?.stop();liveKey='';
  primary=createClient();livePending=false;resolvedDecision=null;
}
async function call(fn,...args){const res=JSON.parse(await rpc(fn,args));if(!res.ok)throw new Error(res.error);return res;}
function fail(error){resumeAfterItem=false;const loader=$('#habitat-loading');if(loader){loader.classList.add('failed');$('#loading-stage').textContent='The habitat couldn’t wake up.';$('.loading-hint').textContent='Try loading it again to welcome the Nouls.';$('#loading-retry').hidden=false;}running=false;busy=false;$('#connect-live').disabled=false;document.querySelectorAll('[data-mode]').forEach(b=>b.disabled=false);$('#play').textContent='Resume';$('#status').textContent=error.message+(mode==='live'?' Live session paused. You can retry, or use offline exploration / import a CLI-recorded bank.':'');$('.observation').classList.remove('thinking');}
// Keep the rendered artwork mounted: moving a Noul must not reload its image.
function patchSvg(current, next) {
  for (const attr of [...current.attributes]) {
    if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
  }
  for (const attr of next.attributes) {
    if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
  }
  if (current.children.length !== next.children.length) {
    current.replaceChildren(...next.childNodes);
    return;
  }
  if (!next.children.length) {
    if (current.textContent !== next.textContent) current.textContent = next.textContent;
    return;
  }
  [...next.children].forEach((child, i) => {
    const old = current.children[i];
    if (old.tagName !== child.tagName) old.replaceWith(child.cloneNode(true));
    else patchSvg(old, child);
  });
}
function draw(frame) {
  const previousWorld=world;
  world=frame.world;
  showItemActivity(previousWorld);
  const current=$('#nouls-world');
  if (!current) $('#world').innerHTML=frame.svg;
  else {
    const template=document.createElement('template');template.innerHTML=frame.svg;
    const next=template.content.querySelector('svg');
    for (const id of ['world-entities','world-creatures']) {
      patchSvg(current.querySelector('#'+id),next.querySelector('#'+id));
    }
  }
  drawArtwork();
  motion.update(world);
  updateVitals();
  updateIdentity(previousWorld);
  $('#tick').textContent=`Tick ${world.tick}`;
  $('#phase').textContent=['Early day','Late day','Dusk'][Math.floor(world.tick%120/40)];
  highlight();
}
function highlight(){
  document.querySelectorAll('.noul').forEach(el=>{
    const c=world.creatures.find(c=>c.id===el.dataset.id);if(!c)return;
    el.classList.toggle('selected',c.id===selected);
    el.style.setProperty('--creature',colors[c.soul]);
  });
  const c=world.creatures.find(c=>c.id===selected);
  const held=world.entities.find(e=>e.carrier===selected);
  $('#carrying-note').textContent=held?`Carrying: ${held.desc}`:'Carrying: nothing · room for one item';
  if(c)$('.observation').style.setProperty('--creature',colors[c.soul]);
}
function tabs(){const root=$('#creature-tabs');root.replaceChildren();for(const c of world.creatures){const b=document.createElement('button');b.textContent=c.profile?c.name:c.soul[0].toUpperCase()+c.soul.slice(1);b.style.setProperty('--creature',colors[c.soul]);b.setAttribute('aria-pressed',c.id===selected);b.onclick=()=>{if(!busy)selectCreature(c.id).catch(fail);};root.append(b);}}
async function selectCreature(id){const selectionEpoch=epoch;selected=id;highlight();tabs();const c=world.creatures.find(c=>c.id===id);$('#creature-name').textContent=c.name;$('#portrait').className=`portrait ${c.soul}`;$('#personality').textContent=c.profile?JSON.parse(c.profile).description:flavors[c.soul];$('#character-traits').hidden=!c.profile;if(c.profile)renderProfile($('#character-traits'),JSON.parse(c.profile));updateVitals();updateIdentity();
 const ix=rows.findLastIndex(r=>r.creatureId===id);if(ix>=0)await showRow(ix);else{review=null;updateSocial();$('#watch').disabled=true;$('#source-badge').textContent='Awaiting Jev';$('#distribution').replaceChildren();$('#outcome').hidden=true;$('#verified').textContent='';$('#decision-stage').textContent=liveKey?'Waiting for this creature’s first Jev judgment.':'Connect Jev to watch a real decision.';const p=await call('perceptOf',JSON.stringify(world),id);$('#decision-context').textContent=`Current intent: ${p.intent}. Acts at confidence ${Math.round(p.threshold*100)}%.`;if(selectionEpoch===epoch&&selected===id)$('#evidence').textContent=JSON.stringify(p.state,null,2);}updateSocial();}
function showEvidence(){if(!review)return;const raw=review.row[evidence];try{$('#evidence').textContent=JSON.stringify(JSON.parse(raw),null,2);}catch{$('#evidence').textContent=raw;}}
function actionLabel(action){if(action.tag==='Do'){const target=review ? [...(JSON.parse(review.row.state).nearby||[]),...(JSON.parse(review.row.state).others||[]),...(JSON.parse(review.row.state).map||[])].find(e=>e.id===action.intent?.id) : null;return `${action.intent?.tag || 'Act'}${target ? ': '+(target.name||target.desc) : action.intent?.id ? ' '+action.intent.id : ''}`;};return action.tag||JSON.stringify(action);}
async function showRow(index){const requestEpoch=epoch;const row=rows[index];const result=await call('review',JSON.stringify(row));if(requestEpoch!==epoch||selected!==row.creatureId)return;activeRow=index;review=result;$('#watch').disabled=false;$('#source-badge').textContent=review.row.source==='synthetic'?'Synthetic fixture':'Recorded';$('#verified').textContent=review.verified?'✓ Action reproduced':'Action diverged';$('#decision-context').textContent=`Recorded at tick ${review.row.tick}. Personality threshold ${Math.round(review.threshold*100)}%.`;$('#distribution').innerHTML=review.bars;$('#decision-stage').textContent='Perception → typed answers → policy → action';$('#outcome').hidden=false;$('#outcome').replaceChildren();const strong=document.createElement('strong');strong.textContent=`Final action: ${actionLabel(review.action)}`;const note=document.createElement('span');note.textContent=review.explanation;$('#outcome').append(strong,note);showEvidence();renderLedger();updateSocial();}
function renderLedger(){const root=$('#timeline');root.replaceChildren();if(!rows.length){const empty=document.createElement('p');empty.className='ledger-empty';empty.textContent='The next decision is unwritten. Connect Jev and watch this fill with real judgments.';root.append(empty);}rows.slice(-80).forEach((r,offset)=>{const i=Math.max(0,rows.length-80)+offset;const b=document.createElement('button');b.className=i===activeRow?'active':'';const small=document.createElement('small');small.textContent=`Tick ${r.tick} / ${r.source==='synthetic'?'Synthetic fixture':'Recorded decision'}`;const strong=document.createElement('strong');strong.textContent=world.creatures.find(c=>c.id===r.creatureId)?.name||`${r.soul} Noul`;const sub=document.createElement('small');sub.textContent=`Roll ${Math.round(r.roll*100)}% · inspect decision`;b.append(small,strong,sub);b.onclick=async()=>{try{if(busy||addingItem)return;running=false;$('#play').textContent='Resume';selected=r.creatureId;await selectCreature(selected);await showRow(i);openGamePanel('observation-panel');}catch(e){fail(e)}};root.append(b)});$('#bank-count').textContent=`${rows.length} banked decision${rows.length===1?'':'s'}`;const total=rows.filter(r=>r.source!=='synthetic').reduce((sum,r)=>sum+(JSON.parse(r.decision).cost_usd||0),0);$('#cost').textContent=`Recorded cost $${total.toFixed(6)} / replay $0`;$('#download').disabled=!rows.length;}
async function watchDecision() {
  if(busy||!review)return;
  running=false;busy=true;
  $('#play').textContent='Resume';$('#watch').disabled=true;
  const current=epoch;
  $('.observation').classList.add('thinking');
  $('#distribution').style.visibility='hidden';$('#outcome').hidden=true;
  $('#decision-stage').textContent='Replaying the recorded perception…';
  await new Promise(resolve=>setTimeout(resolve,700));
  if(current!==epoch){busy=false;return;}
  $('#distribution').style.visibility='visible';
  $('#decision-stage').textContent=`Banked roll ${Math.round(review.row.roll*100)}% lands on ${review.sample}.`;
  $('.observation').classList.remove('thinking');
  await new Promise(resolve=>setTimeout(resolve,550));
  if(current===epoch){
    $('#outcome').hidden=false;
    $('#verified').textContent=review.verified?'✓ Action reproduced':'Action diverged';
    $('#watch').disabled=false;
  }
  busy=false;
}
async function configure(next,key='',reset=false) {
  document.querySelectorAll('[data-mode]').forEach(button=>button.disabled=true);
  epoch++;running=false;mode=next;busy=false;placing=false;
  livePending=false;resolvedDecision=null;
  $('#world').classList.remove('placing');$('#status').textContent='';
  $('#play').disabled=true;$('#reset').disabled=true;
  $('#distribution').style.visibility='visible';
  if(!primary){
    startWorker();
    await rpc('configure',[],{mode:'replay'});
    
  }
  if(mode==='live'){
    const response=await publicTransport.request('api/status');
    if(!response.ok)throw new Error('Unable to initialize browser transport.');
    const transport=await response.json();
    if(!transport.available)throw new Error('Live transport is unavailable.');
    if(!liveSession||reset){
      const sessionResponse=await publicTransport.request('api/session',{method:'POST'});
      const session=await sessionResponse.json();
      if(!session.ok)throw new Error(session.error);
      liveSession=session.session;sessionBudget=session.budget;sessionCost=0;
    }
    liveKey=key;
    await rpc('configure',[],{mode:'simulate'});
  } else liveKey='';
  if(!world||reset){draw(await call('init'));liveCount=0;}
  $('#runtime').textContent=liveKey?'Jev live · direct from your browser':'Habitat ready · connect Jev';$('#connect-live').textContent=liveKey?'Jev connected · key settings':'Connect Jev';
  document.querySelectorAll('[data-mode]').forEach(button=>{
    button.setAttribute('aria-pressed',button.dataset.mode===mode);
    if(button.dataset.mode==='live')button.textContent=mode==='live'?'Live connected':'Connect live';
    button.disabled=false;
  });
  $('#mode-note').textContent=`Jev live · $${sessionCost.toFixed(6)} / $${sessionBudget.toFixed(2)}`;
  $('#world-note').textContent=mode==='live'?'New encounters invite new judgments':'A world of description-only things';
  $('#place').disabled=false;$('#artifact').disabled=false;
  $('#play').disabled=false;$('#reset').disabled=false;
  $('#play').textContent='Pause';
  await selectCreature(selected);
  running=!addingItem;syncItemControls();
}
// AILANG prepares/parses the decision; browser fetch carries the bytes.
// The worker is free to advance physics while OpenRouter responds.
async function requestJudgment(id, snapshot, generation) {
  livePending=true;
  const started=Date.now();
  $('.observation').classList.add('thinking');
  const progress=setInterval(()=>{
    if(generation===epoch)$('#decision-stage').textContent=`Waiting for a live judgment… ${Math.floor((Date.now()-started)/1000)}s`;
  },1000);
  try {
    const response=await publicTransport.request('api/decision',{
      method:'POST',
      headers:{'Content-Type':'application/json','X-Nouls-Key':liveKey},
      body:JSON.stringify({world:snapshot,id,completed:liveCount,session:liveSession}),
      signal:AbortSignal.timeout(45000)
    });
    const result=await response.json();
    if(generation!==epoch){if(result.ok){rows.push(result.row);renderLedger();}return;}
    if(response.status===429&&result.retryable){$('#decision-stage').textContent=result.error;await new Promise(resolve=>setTimeout(resolve,1500));return;}
    if(typeof result.sessionCost==='number')sessionCost=Math.max(sessionCost,result.sessionCost);
    if(!result.ok)throw new Error(result.error);
    rows.push(result.row);renderLedger();
    resolvedDecision={row:result.row,snapshot};
    liveCount++;sessionCost=Math.max(sessionCost,result.sessionCost);
    $('#mode-note').textContent=`Jev live · $${sessionCost.toFixed(6)} / $${sessionBudget.toFixed(2)}`;
  } catch(error) {
    if(generation===epoch)fail(error);
  } finally {
    clearInterval(progress);
    if(generation===epoch){livePending=false;$('.observation').classList.remove('thinking');}
  }
}
async function loop() {
  if(!running||busy||addingItem||!world)return;
  busy=true;
  const current=epoch;
  try {
    if(mode==='simulate') {
      const frame=await call('tick',JSON.stringify(world));
      if(current===epoch)draw(frame);
    } else if(mode==='live') {
      if(resolvedDecision) {
        const completed=resolvedDecision;resolvedDecision=null;
        const frame=await call('applyDecision',JSON.stringify(world),completed.snapshot,JSON.stringify(completed.row));
        if(current!==epoch)return;
        draw(frame);selected=completed.row.creatureId;
        await selectCreature(selected);
      } else {
        const frame=await call('coast',JSON.stringify(world));
        if(current!==epoch)return;
        draw(frame);
      }
      if(world.creatures.every(c=>c.status==='dead')){running=false;$('#play').textContent='Habitat ended';$('#status').textContent='All four creatures have died. Their decisions remain in the bank. Reset to begin a new habitat.';return;}
      if(!running||addingItem)return;
      if(!livePending&&!artJobs.size&&sessionCost<sessionBudget) {
        const due=await call('whoDeliberates',JSON.stringify(world));
        if(current!==epoch||!running||addingItem)return;
        if(due.ids.length){
          const id=due.ids[0];
          lastLiveId=id;requestJudgment(id,JSON.stringify(world),current);
        }
      } else if(!livePending&&!resolvedDecision&&sessionCost>=sessionBudget){
        running=false;$('#play').textContent='Resume';$('#status').textContent='The approved session budget has been reached. Download the bank, or reset to start a new session.';
      }
    }
  } catch(error) {if(current===epoch)fail(error);}
  finally {if(current===epoch)busy=false;}
}
$('#play').onclick=()=>{if(!liveKey){$('#connect-live').click();return;}running=!running;$('#play').textContent=running?'Pause':'Resume';};
$('#watch').onclick=()=>watchDecision().catch(fail);
$('#reset').onclick=()=>{clearPlacementPing();hideDescription();resetGeneratedArt();imageGeneration++;imageBusy=false;artwork.clear();pendingArtwork=null;$('#artifact-image').value='';if(liveKey)configure('live',liveKey,true).catch(fail);else call('init').then(draw).catch(fail);};
$('#connect-live').onclick=()=>{$('#api-key').value=localStorage.getItem('openrouter-api-key')||'';$('#live-dialog').showModal();};
$('#key-form').onsubmit=e=>{e.preventDefault();const key=$('#api-key').value.trim();localStorage.setItem('openrouter-api-key',key);$('#api-key').value='';$('#live-dialog').close();configure('live',key).then(()=>{running=!addingItem;$('#play').textContent='Pause';$('#decision-stage').textContent='Live session started. Waiting for the first judgment…';}).catch(fail);};
$('#about-button').onclick=()=>$('#about').showModal();document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
function syncItemControls(){
  for(const id of ['play','reset','connect-live','create-noul','watch','import-bank']){
    const el=$('#'+id);
    if(addingItem){if(!el.hasAttribute('data-item-disabled'))el.dataset.itemDisabled=String(el.disabled);el.disabled=true;}
    else if(el.hasAttribute('data-item-disabled')){el.disabled=el.dataset.itemDisabled==='true';delete el.dataset.itemDisabled;}
  }
  $('#add-item').disabled=addingItem;
  $('#placement-controls').hidden=!placing;
  $('#world').classList.toggle('placing',placing);
  $('.habitat').classList.toggle('item-placing',placing);
  for(const id of ['place-center','edit-item','cancel-placement'])$('#'+id).disabled=committingItem;
}
function openItem(){
  if(committingItem)return;
  if(!addingItem){resumeAfterItem=running;addingItem=true;}
  running=false;placing=false;$('#play').textContent='Paused';hideDescription();syncItemControls();
  syncArtOption();$('#item-dialog').showModal();
}
function focusHabitat(){
  if(!placing)return;
  $('.world-wrap').scrollIntoView({block:'center',behavior:'instant'});
  $('#world').focus({preventScroll:true});
}
function finishItem(placed=false){
  if(committingItem)return;
  addingItem=false;placing=false;
  $('#item-dialog').close();syncItemControls();
  running=resumeAfterItem;resumeAfterItem=false;
  $('#play').textContent=running?'Pause':liveKey?'Resume':'Start Jev';
  if(placed)$('#status').textContent=running?'Item added. The Nouls are exploring again.':'Item added. Start or resume Jev to see what the Nouls make of it.';
  $('#add-item').focus({preventScroll:true});
}
$('#add-item').onclick=openItem;
$('#edit-item').onclick=openItem;
for(const id of ['close-item','cancel-item','cancel-placement'])$('#'+id).onclick=()=>finishItem();
$('#item-dialog').addEventListener('cancel',e=>{e.preventDefault();finishItem();});
document.querySelectorAll('[data-item]').forEach(button=>button.onclick=()=>{$('#artifact').value=button.dataset.item;$('#artifact').focus();});
$('#artifact-form').onsubmit=e=>{
  e.preventDefault();if(imageBusy){$('#image-note').textContent='Preparing the picture…';return;}
  if(!$('#artifact').value.trim())return;
  document.activeElement.blur();placing=true;$('#item-dialog').close();syncItemControls();
  $('#placement-note').textContent='Paused · Tap a spot for your item, or place it in the centre.';
  requestAnimationFrame(focusHabitat);
};
// Keep the habitat visible as the phone keyboard retracts.
window.visualViewport?.addEventListener('resize',()=>{if(placing)requestAnimationFrame(focusHabitat);});
let placementPingTimer;
function clearPlacementPing(){
  clearTimeout(placementPingTimer);$('#placement-ping')?.remove();
}
function placementPing(x,y,confirmed=false){
  clearPlacementPing();
  const bounds=$('#nouls-world').viewBox.baseVal;
  const ping=document.createElement('span');ping.id='placement-ping';
  ping.className='placement-ping'+(confirmed?' confirmed':'');ping.setAttribute('aria-hidden','true');
  ping.style.left=`${(x-bounds.x)/bounds.width*100}%`;
  ping.style.top=`${(y-bounds.y)/bounds.height*100}%`;
  $('#world').append(ping);
  if(confirmed)placementPingTimer=setTimeout(clearPlacementPing,1400);
}
function showPlacedDescription(entity){
  showDescription(entity);
  const popup=$('#object-description');popup.dataset.placement='true';
  $('#object-description strong').textContent='Added to the habitat';
  popupCloseTimer=setTimeout(hideDescription,4000);
}
async function placeItem(x,y){
  if(!placing||committingItem)return;
  if(busy){$('#placement-note').textContent='Finishing the last movement… tap again in a moment.';return;}
  busy=true;committingItem=true;syncItemControls();
  placementPing(x,y);
  try{
    const frame=await call('addEntity',JSON.stringify(world),$('#artifact').value.trim(),String(x),String(y));
    const entity=frame.world.entities.at(-1);
    const shouldDraw=$('#generate-art').checked&&!$('#generate-art').disabled&&!pendingArtwork;
    if(pendingArtwork)artwork.set(entity.id,pendingArtwork);
    draw(frame);
    if(shouldDraw)queueItemArt(entity);
pendingArtwork=null;imageGeneration++;$('#artifact-image').value='';$('#artifact').value='';
    $('#image-note').textContent='PNG, JPEG or WebP, up to 4 MB. Pictures stay in this browser; Jev reads your description.';
    $('#item-picture').open=false;committingItem=false;finishItem(true);
    placementPing(entity.pos.x,entity.pos.y,true);
    showPlacedDescription(entity);
  }catch(error){clearPlacementPing();resumeAfterItem=false;$('#placement-note').textContent='Could not place the item. Try another spot or cancel.';fail(error);}
  finally{busy=false;committingItem=false;syncItemControls();}
}
$('#place-center').onclick=()=>placeItem($('#nouls-world').viewBox.baseVal.width/2,$('#nouls-world').viewBox.baseVal.height/2);
$('#world').onclick=async e=>{try{
  if(placing){const svg=$('#world svg'),pt=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());await placeItem(Math.max(0,Math.min(svg.viewBox.baseVal.width,pt.x)),Math.max(0,Math.min(svg.viewBox.baseVal.height,pt.y)));}
  else if(e.target.closest('[data-object]')){const ent=world.entities.find(v=>v.id===e.target.closest('[data-object]').dataset.object);if(ent)showDescription(ent,e);}
  else if(!busy&&e.target.closest('.noul')){await selectCreature(e.target.closest('.noul').dataset.id);openGamePanel('observation-panel');}
}catch(err){busy=false;fail(err);}};
$('#world').onkeydown=e=>{if(placing&&(e.key==='Enter'||e.key===' ')){e.preventDefault();placeItem($('#nouls-world').viewBox.baseVal.width/2,$('#nouls-world').viewBox.baseVal.height/2);}else if(!busy&&(e.key==='Enter'||e.key===' ')&&e.target.closest('.noul')){e.preventDefault();selectCreature(e.target.closest('.noul').dataset.id).then(()=>openGamePanel('observation-panel')).catch(fail);}};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&placing){e.preventDefault();finishItem();}});
document.querySelectorAll('[data-evidence]').forEach(b=>b.onclick=()=>{evidence=b.dataset.evidence;showEvidence();});
$('#download').onclick=()=>{const url=URL.createObjectURL(new Blob([rows.map(r=>JSON.stringify(r)).join('\n')+'\n'],{type:'application/x-ndjson'}));const a=document.createElement('a');a.href=url;a.download='nouls-bank.jsonl';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('#import-bank').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>64e6)throw new Error('Choose a bank smaller than 64 MB.');running=false;const imported=(await file.text()).trim().split('\n').map(JSON.parse);if(!imported.length||imported.length>10000)throw new Error('Use a bank with 1–10,000 decisions.');let restored={world};for(const row of imported){const checked=await call('review',JSON.stringify(row));if(!checked.verified)throw new Error('Import stopped: a banked action diverged.');if(!restored.world.creatures.some(c=>c.id===row.creatureId))restored=await call('restoreNoul',JSON.stringify(restored.world),JSON.stringify(row));}if(restored.svg)draw(restored);rows=imported;selected=rows[0].creatureId;running=false;await selectCreature(selected);await showRow(0);openGamePanel('observation-panel');$('#play').textContent='Resume';}catch(err){fail(err);}finally{e.target.value='';}};
(async()=>{
  try {
    startWorker();
    await rpc('configure',[],{mode:'replay'});
    const initialFrame=await call('init');
    loadingProgress('The habitat is ready.',10);
    draw(initialFrame);
    await selectCreature(selected);
    renderLedger();
    window.__demoReady=true;
    $('#runtime').textContent='Habitat ready · Jev live demo';$('#connect-live').disabled=false;
    $('#play').textContent='Start Jev';$('#play').disabled=false;
    $('#reset').disabled=false;$('#place').disabled=false;$('#artifact').disabled=false;$('#create-noul').disabled=false;$('#add-item').disabled=false;
    $('#mode-note').textContent='Connect Jev to start making decisions';
    $('#world-note').textContent='Waiting for the first encounter';
    setInterval(loop,100);
    if(localStorage.getItem('openrouter-api-key')) {
      await configure('live',localStorage.getItem('openrouter-api-key'));
    }
  } catch(error){if(!window.__demoReady)window.__demoError=error.message;fail(error);$('#runtime').textContent='Live connection needs attention';}
})();


function updateVitals() {
  const c=world?.creatures.find(c=>c.id===selected);if(!c)return;
  const values=[['Tiredness',c.tiredness],['Hunger',c.hunger],['Thirst',c.thirst],['Need to poo',c.bowel],['Health',c.health]];
  if(!$('#vitals').children.length)for(const [label] of values){
    const el=document.createElement('div');el.innerHTML=`<div class="vital-label"><span>${label}</span><span class="vital-value"></span></div><div class="vital-track"><i></i></div>`;$('#vitals').append(el);
  }
  values.forEach(([label,value],i)=>{const el=$('#vitals').children[i];el.querySelector('.vital-value').textContent=`${Math.round(value*100)}%`;el.querySelector('i').style.width=`${value*100}%`;el.classList.toggle('urgent',label==='Health'?value<.35:value>=.8);});
  updateSocial();
  $('#current-thought').textContent=c.status==='dead'?`Died of ${c.deathCause}. Reset starts a new life.`:`${c.pauseTicks>0?'Unsure — pausing briefly':`Current need / intent: ${c.thought}`}`;
}
// Present AILANG preferences and banked Jev distributions; no social policy here.
function updateSocial(){
  const c=world?.creatures.find(c=>c.id===selected);if(!c)return;
  $('#social-preferences').textContent=c.socialPreferences||'';
  const target=world.creatures.find(peer=>peer.id===c.intent.id);
  const activity=c.intent.tag==='Socialize'?`Seeking company: ${target?.name||c.intent.id}`:c.intent.tag==='Avoid'?`Giving space to ${target?.name||c.intent.id}`:'';
  $('#social-encounter').textContent=activity||c.memory?.at(-1)||'';
  const key=JSON.stringify([selected,review?.row?.decision]);if(key===socialViewKey)return;socialViewKey=key;
  const root=$('#social-choices');root.replaceChildren();
  if(!review?.company?.length){const p=document.createElement('p');p.textContent='Social preferences will appear here after a Jev judgment.';root.append(p);return;}
  const observed=JSON.parse(review.row.state).others||[];
  const note=document.createElement('p');note.textContent=`Jev preferences at tick ${review.row.tick}. These can be one-sided and change with encounters.`;root.append(note);
  for(const [heading,options] of [['Seek company',review.company],['Give space',review.avoidance]]){
    const group=document.createElement('div');group.className='social-distribution';
    const title=document.createElement('strong');title.textContent=heading;group.append(title);
    for(const option of options||[]){
      const row=document.createElement('div');row.className='bar-row';
      const name=document.createElement('span');name.textContent=option.key==='alone'?'Own company':option.key==='none'?'Nobody':observed.find(peer=>peer.id===option.key)?.name||option.key;
      const track=document.createElement('div');track.className='bar-track';const fill=document.createElement('div');fill.className='bar-fill';fill.style.width=`${Math.max(0,Math.min(100,option.p*100))}%`;track.append(fill);
      const value=document.createElement('span');value.className='bar-p';value.textContent=`${Math.round(option.p*100)}%`;
      row.append(name,track,value);group.append(row);
    }root.append(group);
  }
}

let itemActivityTimer;
function showItemActivity(previous){
  if(!previous)return;
  if(world.tick<previous.tick){clearTimeout(itemActivityTimer);$('#item-activity').hidden=true;return;}
  const events=[];
  for(const c of world.creatures){
    const latest=c.memory?.at(-1),old=previous.creatures.find(p=>p.id===c.id)?.memory?.at(-1);
    if(latest!==old&&/^I (picked up|put down|destroyed) /.test(latest||''))events.push(`${c.name} ${latest.slice(2)}`);
  }
  if(events.length){clearTimeout(itemActivityTimer);$('#item-activity').hidden=false;$('#item-activity').textContent=events.join(' · ');itemActivityTimer=setTimeout(()=>$('#item-activity').hidden=true,5000);}
}
function drawArtwork() {
  const svg=$('#nouls-world');if(!svg)return;
  for(const id of artwork.keys())if(!world.entities.some(e=>e.id===id))artwork.delete(id);
  for(const ent of world.entities){
    const original=[...svg.querySelectorAll('.world-entity')].find(el=>el.querySelector('title')?.textContent.startsWith(ent.id+':'));
    if(original){original.dataset.object=ent.id;original.dataset.kind=ent.kind;original.setAttribute('tabindex','0');original.setAttribute('role','button');original.setAttribute('aria-label',ent.desc);original.style.visibility=artwork.has(ent.id)||ent.carrier?'hidden':'';}
  }
  const ns='http://www.w3.org/2000/svg';
  for(const layerId of ['player-art','carried-art']){
    let layer=svg.querySelector('#'+layerId);
    if(!layer){layer=document.createElementNS(ns,'g');layer.id=layerId;if(layerId==='player-art')svg.insertBefore(layer,svg.querySelector('#world-creatures'));else svg.append(layer);}
    const entities=world.entities.filter(e=>layerId==='carried-art'?Boolean(e.carrier):!e.carrier&&artwork.has(e.id));
    for(const el of [...layer.children])if(!entities.some(e=>e.id===el.dataset.object))el.remove();
    for(const ent of entities){
      let el=[...layer.children].find(e=>e.dataset.object===ent.id);
      if(!el){
        el=document.createElementNS(ns,'g');el.dataset.object=ent.id;el.setAttribute('tabindex','0');el.setAttribute('role','button');
        const title=document.createElementNS(ns,'title');el.append(title);
        const marker=document.createElementNS(ns,'circle');marker.setAttribute('r','1.45');marker.setAttribute('class','carried-marker');el.append(marker);
        const placeholder=document.createElementNS(ns,'path');placeholder.setAttribute('d','M-1 -.7 Q0 -1.4 1 -.5 L.8 .8 Q0 1.3 -.9 .6Z');placeholder.setAttribute('fill','#ad9168');placeholder.classList.add('item-placeholder');el.append(placeholder);
        const img=document.createElementNS(ns,'image');el.append(img);layer.append(el);
      }
      const data=artwork.get(ent.id),held=Boolean(ent.carrier),size=held?3:4.4;
      const carrier=world.creatures.find(c=>c.id===ent.carrier);
      const label=held?`${carrier?.name||'Noul'} is carrying ${ent.desc}`:ent.desc;
      el.setAttribute('aria-label',label);el.querySelector('title').textContent=label;
      if(held)el.dataset.carrier=ent.carrier;else delete el.dataset.carrier;
      el.querySelector('.carried-marker').style.display=held?'':'none';
      el.querySelector('.item-placeholder').style.display=data?'none':'';
      const img=el.querySelector('image');img.style.display=data?'':'none';
      if(data&&img.getAttribute('href')!==data)img.setAttribute('href',data);
      for(const [name,value] of [['x',-size/2],['y',-size/2],['width',size],['height',size]])img.setAttribute(name,value);
      el.setAttribute('transform',`translate(${ent.pos.x+(held?2.3:0)} ${ent.pos.y+(held?-.5:0)})`);
    }
  }
}

function syncArtOption(){
  const connected=Boolean(liveKey&&liveSession);
  const full=artwork.size+artJobs.size>=8;
  $('#generate-art').disabled=!connected||Boolean(pendingArtwork)||imageBusy||full;
  $('#art-option-note').textContent=pendingArtwork?'Your uploaded picture will be used.':!connected?'Connect Jev to generate pictures. You can still add this item.':full?'This habitat already has eight pictures placed or on the way.':'';
}
function resetGeneratedArt(){
  artworkWorld++;
  for(const job of artJobs.values())job.controller.abort();
  artJobs.clear();artQueue=Promise.resolve();
  $('#artwork-status').hidden=true;
}
function artStatus(message){
  $('#artwork-status').hidden=false;$('#artwork-status').textContent=message;
}
function queueItemArt(entity){
  if(!liveKey||!liveSession||artwork.size+artJobs.size>=8)return;
  const job={id:entity.id,description:entity.desc,world:artworkWorld,session:liveSession,key:liveKey,controller:new AbortController()};
  artJobs.set(job.id,job);artStatus(`Drawing your item${artJobs.size>1?'s':''}… You can keep playing.`);
  artQueue=artQueue.then(()=>generateItemArt(job)).catch(()=>{});
}
// Remove only a uniform, edge-connected green matte from generated artwork.
// Uploaded pictures keep their original background. Crop empty space for legibility.
function itemSprite(bitmap){
  const canvas=document.createElement('canvas'),scale=Math.min(1,384/Math.max(bitmap.width,bitmap.height));
  const w=canvas.width=Math.max(1,Math.round(bitmap.width*scale)),h=canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,w,h);
  const pixels=ctx.getImageData(0,0,w,h),data=pixels.data;
  const corners=[0,(w-1)*4,(w*(h-1))*4,(w*h-1)*4];
  const bg=[0,1,2].map(c=>corners.reduce((sum,i)=>sum+data[i+c],0)/4);
  const uniform=corners.every(i=>data[i+3]>250&&bg.every((v,c)=>Math.abs(v-data[i+c])<16));
  if(uniform&&bg[1]>=bg[0]&&bg[1]>=bg[2]&&Math.min(...bg)>140){
    const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);let head=0,tail=0;
    function visit(n){if(seen[n])return;seen[n]=1;const i=n*4;
      const distance=Math.hypot(data[i]-bg[0],data[i+1]-bg[1],data[i+2]-bg[2]);
      if(distance>50)return;
      data[i+3]=Math.round(255*Math.max(0,(distance-28)/22));queue[tail++]=n;
    }
    for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x);}
    for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}
    while(head<tail){const n=queue[head++],x=n%w,y=Math.floor(n/w);if(x)visit(n-1);if(x<w-1)visit(n+1);if(y)visit(n-w);if(y<h-1)visit(n+w);}
    ctx.putImageData(pixels,0,0);
  }
  let left=w,top=h,right=0,bottom=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>32){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
  if(left>right)return canvas.toDataURL('image/webp',.8);
  const width=right-left+1,height=bottom-top+1,side=Math.max(width,height),padding=Math.ceil(side*.08);
  const sprite=document.createElement('canvas');sprite.width=sprite.height=side+padding*2;
  sprite.getContext('2d').drawImage(canvas,left,top,width,height,padding+(side-width)/2,padding+(side-height)/2,width,height);
  return sprite.toDataURL('image/webp',.8);
}
async function generateItemArt(job){
  const current=()=>job.world===artworkWorld&&artJobs.get(job.id)===job;
  if(!current())return;
  const signal=AbortSignal.any([job.controller.signal,AbortSignal.timeout(90000)]);
  try{
    let result;
    // Only retry explicit local busy responses: they have not called the model.
    while(current()){
      const response=await publicTransport.request('api/image',{method:'POST',headers:{'Content-Type':'application/json','X-Nouls-Key':job.key},
        body:JSON.stringify({session:job.session,id:job.id,description:job.description}),signal});
      result=await response.json();
      if(response.status!==429||!result.retryable)break;
      await new Promise(resolve=>setTimeout(resolve,750));
      signal.throwIfAborted();
    }
    if(!current())return;
    if(job.session===liveSession&&typeof result.sessionCost==='number'){
      sessionCost=Math.max(sessionCost,result.sessionCost);
      $('#mode-note').textContent=`Jev + artwork · $${sessionCost.toFixed(6)} / $${sessionBudget.toFixed(2)}`;
    }
    if(!result.ok)throw Error(result.error||'The picture could not be completed.');
    if(typeof result.image!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(result.image)||result.image.length>8*1024*1024)throw Error('The picture could not be displayed.');
    const bitmap=await createImageBitmap(await (await fetch(result.image)).blob());
    const data=itemSprite(bitmap);bitmap.close();
    if(data.length>180000)throw Error('The picture was too large to display.');
    if(!current())return;
    if(!world.entities.some(e=>e.id===job.id)){artStatus('That item was removed before its picture arrived.');return;}
    artwork.set(job.id,data);drawArtwork();
    artStatus('Your item’s picture is ready'+(typeof result.cost==='number'?` · $${result.cost.toFixed(3)}`:'')+'.');
  }catch(error){
    if(current())artStatus((signal.aborted?'The picture timed out.':error.message)+' Your item remains in the habitat.');
  }finally{
    if(current()){
      artJobs.delete(job.id);
      if(artJobs.size)artStatus(`Drawing ${artJobs.size} more picture${artJobs.size===1?'':'s'}… You can keep playing.`);
      syncArtOption();
    }
    job.key='';
  }
}
$('#artifact-image').onchange=async e=>{
  const generation=++imageGeneration;const file=e.target.files[0];pendingArtwork=null;imageBusy=false;syncArtOption();if(!file)return;imageBusy=true;syncArtOption();
  try{
    if(artwork.size+artJobs.size>=8)throw Error('This world already has eight pictures. Reset to start a new world.');
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>4*1024*1024)throw Error('Choose a PNG, JPEG or WebP no larger than 4 MB.');
    const bitmap=await createImageBitmap(file);
    const canvas=document.createElement('canvas');const scale=Math.min(1,384/Math.max(bitmap.width,bitmap.height));
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    const data=canvas.toDataURL('image/webp',.8);
    if(data.length>180000)throw Error('This picture is too complex. Choose a smaller or simpler picture.');
    if(generation!==imageGeneration)return;pendingArtwork=data;$('#image-note').textContent='Picture ready. Add a description, then place it in the world.';
  }catch(error){if(generation===imageGeneration){e.target.value='';$('#image-note').textContent=error.message;}}finally{if(generation===imageGeneration){imageBusy=false;syncArtOption();}}
};
$('#world').addEventListener('keydown',e=>{if(!placing&&(e.key==='Enter'||e.key===' ')&&e.target.closest('[data-object]')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});

let popupCloseTimer;
function showDescription(ent,event) {
  clearTimeout(popupCloseTimer);
  const popup=$('#object-description');delete popup.dataset.placement;popup.hidden=false;
  $('#object-description strong').textContent='Description Jev sees';
  $('#object-description p').textContent=ent.desc;
  const hover=event&&event.type!=='focusin'&&matchMedia('(hover:hover)').matches;
  popup.classList.toggle('hover-popup',Boolean(hover));
  if(hover){
    const bounds=$('.world-wrap').getBoundingClientRect();
    const width=Math.min(270,bounds.width-24);popup.style.width=`${width}px`;
    const x=Math.max(8,Math.min(bounds.width-width-8,event.clientX-bounds.left+16));
    const y=Math.max(8,Math.min(bounds.height-popup.offsetHeight-8,event.clientY-bounds.top+16));
    popup.style.left=`${x}px`;popup.style.top=`${y}px`;
  }else{popup.style.width='';popup.style.left='';popup.style.top='';}
}
function hideDescription(){clearTimeout(popupCloseTimer);$('#object-description').hidden=true;delete $('#object-description').dataset.placement;}
$('#close-description').onclick=hideDescription;
$('#object-description').onpointerenter=()=>{if(!$('#object-description').dataset.placement)clearTimeout(popupCloseTimer);};
$('#object-description').onpointerleave=()=>{if($('#object-description').classList.contains('hover-popup'))hideDescription();};
$('#world').addEventListener('pointermove',e=>{
  if(addingItem||$('#object-description').dataset.placement||e.pointerType==='touch')return;
  const id=e.target.closest('[data-object]')?.dataset.object;
  const ent=world?.entities.find(v=>v.id===id);
  if(ent)showDescription(ent,e);
  else if($('#object-description').classList.contains('hover-popup')){
    clearTimeout(popupCloseTimer);popupCloseTimer=setTimeout(hideDescription,140);
  }
});
$('#world').addEventListener('pointerleave',()=>{if($('#object-description').classList.contains('hover-popup'))popupCloseTimer=setTimeout(hideDescription,180);});
$('#world').addEventListener('focusin',e=>{if(addingItem)return;const id=e.target.closest('[data-object]')?.dataset.object;const ent=world?.entities.find(v=>v.id===id);if(ent)showDescription(ent,e);});

let characterDesign=null, designingCharacter=false;
function renderProfile(container,p){
 container.replaceChildren();
 for(const [label,value] of [['Appearance',p.appearance],['Act confidence',`${Math.round(p.actThreshold*100)}%`],['Threat evidence',`${Math.round(p.presentAt*100)}%`],['Reconsider every',`${p.cadence} ticks`],['Walking speed',`${p.speed.toFixed(2)}×`],['Stamina',`${p.stamina.toFixed(2)}×`]]){
  const item=document.createElement('div'),name=document.createElement('span'),val=document.createElement('strong');name.textContent=label;val.textContent=value;item.append(name,val);container.append(item);
 }
}
$('#create-noul').onclick=()=>{running=false;$('#play').textContent='Resume';$('#character-status').textContent=world.creatures.length>=8?'This habitat is full. Reset to start a new habitat.':!liveKey?'Connect Jev using the habitat button before interpreting your character.':'';$('#character-dialog').showModal();};
for(const id of ['character-name','character-description'])$('#'+id).oninput=()=>{characterDesign=null;$('#character-preview').hidden=true;};
$('#character-form').onsubmit=async e=>{
 e.preventDefault();if(designingCharacter)return;
 if(!liveKey||!liveSession){$('#character-status').textContent='Connect Jev using the habitat button first. Your draft will stay here.';return;}
 if(world.creatures.length>=8){$('#character-status').textContent='This habitat is full (eight Nouls).';return;}
 designingCharacter=true;characterDesign=null;$('#character-preview').hidden=true;$('#design-character').disabled=true;
 $('#character-name').disabled=true;$('#character-description').disabled=true;
 const generation=epoch;
 try{
  $('#character-status').textContent='Waiting for the current judgment to finish…';
  while(livePending)await new Promise(resolve=>setTimeout(resolve,100));
  if(generation!==epoch)throw new Error('The session changed. Interpret the character again.');
  $('#character-status').textContent='Jev is interpreting your character…';
  const response=await publicTransport.request('api/character',{method:'POST',headers:{'Content-Type':'application/json','X-Nouls-Key':liveKey},body:JSON.stringify({session:liveSession,name:$('#character-name').value.trim(),description:$('#character-description').value.trim()}),signal:AbortSignal.timeout(45000)});
  const result=await response.json();
  if(generation!==epoch)return;
  if(typeof result.sessionCost==='number'){sessionCost=Math.max(sessionCost,result.sessionCost);$('#mode-note').textContent=`Jev live · $${sessionCost.toFixed(6)} / $${sessionBudget.toFixed(2)}`;}
  if(!result.ok)throw new Error(result.error||'Character interpretation failed.');
  characterDesign=result;renderProfile($('#proposed-traits'),result.profile);$('#character-evidence').textContent=JSON.stringify(result.decision,null,2);$('#character-preview').hidden=false;$('#character-status').textContent='Ready to review. Add this Noul, or edit the description and interpret again.';
 }catch(error){$('#character-status').textContent=error.message;}
 finally{designingCharacter=false;$('#design-character').disabled=false;$('#character-name').disabled=false;$('#character-description').disabled=false;}
};
$('#add-character').onclick=async()=>{
 if(!characterDesign||busy)return;busy=true;$('#add-character').disabled=true;
 try{const frame=await call('addNoul',JSON.stringify(world),JSON.stringify(characterDesign.profile));draw(frame);await selectCreature(world.creatures.at(-1).id);$('#character-dialog').close();$('#status').textContent=`${world.creatures.at(-1).name} joined the habitat. Resume to watch its first judgment.`;characterDesign=null;$('#character-preview').hidden=true;}
 catch(error){$('#character-status').textContent=error.message;}
 finally{busy=false;$('#add-character').disabled=false;}
};
$('#download-character').onclick=()=>{if(!characterDesign)return;const url=URL.createObjectURL(new Blob([JSON.stringify({profile:characterDesign.profile,decision:characterDesign.decision},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='noul-character.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

// Open inspection only from deliberate user actions; live judgments stay in the habitat.
function openGamePanel(id){
  for(const panel of document.querySelectorAll('.game-panel[open]'))panel.close();
  hideDescription();
  document.getElementById(id).showModal();
}
$('#observe').onclick=()=>openGamePanel('observation-panel');
$('#history').onclick=()=>openGamePanel('history-panel');
for(const panel of document.querySelectorAll('.game-panel')){
  panel.addEventListener('click',event=>{
    const box=panel.getBoundingClientRect();
    if(event.target===panel&&(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom))panel.close();
  });
}
const fullscreenButton=$('#fullscreen');
fullscreenButton.hidden=!document.fullscreenEnabled;
fullscreenButton.onclick=async()=>{
  try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  }catch{ $('#status').textContent='Full screen is unavailable in this browser. The habitat still fills the window.'; }
};
document.addEventListener('fullscreenchange',()=>{
  const active=!!document.fullscreenElement;
  fullscreenButton.querySelector('span').textContent=active?'Exit full screen':'Full screen';
  fullscreenButton.setAttribute('aria-label',active?'Exit full screen':'Enter full screen');
});


// All beliefs, descriptions and evidence come from AILANG; the UI only presents them.
function updateIdentity(previousWorld) {
  const c=world?.creatures.find(c=>c.id===selected);
  if(c){
    const identity=c.identity||{history:[],total:0,reviewed:0};
    $('#self-description').textContent=c.selfDescription||flavors[c.soul];
    $('#original-description').textContent=c.originalDescription||flavors[c.soul];
    $('#identity-count').textContent=identity.history.length?'Shaped by experience':'A new beginning';
    const pending=Math.max(0,identity.total-identity.reviewed);
    $('#identity-progress').textContent=c.health<=0?'A life remembered.':pending>=3?'Ready to reflect at the next Jev judgment.':`${Math.min(pending,3)} / 3 new experiences before reflection. Keeping a belief is a choice, too.`;
    const history=$('#identity-history');
    const signature=JSON.stringify([c.id,identity.history]);
    if(history.dataset.signature!==signature){
      history.dataset.signature=signature;history.replaceChildren();
      if(!identity.history.length){const p=document.createElement('p');p.textContent='Their story is just beginning. Completed experiences give Jev evidence to reflect on.';history.append(p);}
      for(const change of [...identity.history].reverse()){
        const entry=document.createElement('article');entry.className='identity-change';
        const label=document.createElement('strong');label.textContent=`A new understanding · tick ${change.tick}`;
        const before=document.createElement('p');before.className='identity-before';before.textContent=`Before: ${change.before}`;
        const after=document.createElement('p');after.textContent=change.after;
        const evidence=document.createElement('ul');
        for(const event of change.evidence){const li=document.createElement('li');li.textContent=`Tick ${event.tick}: ${event.text}`;evidence.append(li);}
        entry.append(label,before,after,evidence);history.append(entry);
      }
    }
  }
  if(!previousWorld){if(!world?.creatures.some(c=>c.identity?.history.length))$('#identity-activity').hidden=true;return;}
  const changed=world.creatures.find(c=>{
    const old=previousWorld.creatures.find(p=>p.id===c.id);
    return old&&JSON.stringify(old.identity?.beliefs)!==JSON.stringify(c.identity?.beliefs)&&c.identity?.history.length;
  });
  if(changed){const notice=$('#identity-activity');notice.hidden=false;notice.textContent=`${changed.name} sees themselves differently. Read their story →`;notice.onclick=async()=>{await selectCreature(changed.id);openGamePanel('observation-panel');};}
  else if(!world.creatures.some(c=>c.identity?.history.length))$('#identity-activity').hidden=true;
}
