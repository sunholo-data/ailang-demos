/* Portable browser presentation + AILANG snapshot; never stores credentials or spending approval. */
const NoulSession={
  pack(world,rows,titles,artwork,story){
    return {format:'nouls-session',version:1,savedAt:new Date().toISOString(),world,rows,
      titles:[...titles],artwork:[...artwork],story:story.map(({kind,id,tick,title,detail,explanation,facts,source})=>({kind,id,tick,title,detail,explanation,facts,source}))};
  },
  read(text){
    let data;try{data=JSON.parse(text);}catch{data={rows:text.trim().split('\n').map(line=>JSON.parse(line))};}
    if(data.format!=='nouls-session'){
      const rows=Array.isArray(data)?data:data.rows||[data];this.checkRows(rows,false);return {rows};
    }
    if(data.version!==1)throw Error('This session format is not supported.');
    this.checkRows(data.rows,true);
    const w=data.world;
    if(!w||w.size!==60||!Number.isSafeInteger(w.tick)||w.tick<0||!Array.isArray(w.creatures)||!w.creatures.length||w.creatures.length>8||!Array.isArray(w.entities)||w.entities.length>40)throw Error('Invalid saved habitat.');
    const ids=new Set();
    const string=(s,max)=>typeof s==='string'&&s.length<=max;
    for(const item of [...w.creatures,...w.entities]){
      if(!string(item.id,100)||!item.id||ids.has(item.id)||!Number.isFinite(item.pos?.x)||!Number.isFinite(item.pos?.y)||item.pos.x<0||item.pos.y<0||item.pos.x>w.size||item.pos.y>w.size)throw Error('Invalid saved object or position.');
      ids.add(item.id);
    }
    for(const e of w.entities)if(!string(e.desc,160)||!string(e.carrier||'',100))throw Error('Invalid saved item description.');
    for(const c of w.creatures){
      if(!string(c.name,100)||!['wary','bold','paranoid','curious'].includes(c.soul)||!string(c.profile||'',10000))throw Error('Invalid saved Noul.');
      if(c.profile){let p;try{p=JSON.parse(c.profile);}catch{throw Error('Invalid character profile.');}if(typeof p.description!=='string')throw Error('Invalid character profile.');}
      for(const key of ['hunger','thirst','bowel','energy','fear','comfort','health'])if(!Number.isFinite(c[key])||c[key]<0||c[key]>1)throw Error('Invalid saved needs.');
    }
    const titles=data.titles||[],artwork=data.artwork||[],story=data.story||[];
    if(!Array.isArray(titles)||titles.length>40||titles.some(p=>!Array.isArray(p)||p.length!==2||!ids.has(p[0])||!string(p[1],32)))throw Error('Invalid saved item titles.');
    if(!Array.isArray(artwork)||artwork.length>40||artwork.some(p=>!Array.isArray(p)||p.length!==2||!ids.has(p[0])||!string(p[1],6e6)||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p[1])))throw Error('Invalid saved pictures.');
    if(!Array.isArray(story)||story.length>80)throw Error('Invalid saved story.');
    const cleanStory=story.map(e=>{
      if(!['judgment','outcome','identity'].includes(e.kind)||!ids.has(e.id)||!Number.isSafeInteger(e.tick)||!string(e.title,4000)||!string(e.detail||'',4000)||!string(e.source,100)||!string(e.explanation||'',10000)||!Array.isArray(e.facts||[])||(e.facts||[]).some(f=>!string(f,4000)))throw Error('Invalid saved story event.');
      return {kind:e.kind,id:e.id,tick:e.tick,title:e.title,detail:e.detail||'',source:e.source,explanation:e.explanation||'',facts:e.facts||[]};
    });
    return {world:w,rows:data.rows,titles,artwork,story:cleanStory};
  },
  checkRows(rows,empty){
    if(!Array.isArray(rows)||(!empty&&!rows.length)||rows.length>10000||rows.some(r=>!r||typeof r.state!=='string'||typeof r.decision!=='string'||typeof r.action!=='string'))throw Error('Use a bank with up to 10,000 decisions.');
  }
};
globalThis.NoulSession=NoulSession;
if(typeof module!=='undefined')module.exports=NoulSession;
