/* Presentation of recorded AILANG state and typed answers, never a game policy. */
const NoulFeedback = {
  parse(value) { try{return typeof value==='string'?JSON.parse(value):value;}catch{return null;} },
  percent(value) { return Number.isFinite(value)?`${Math.round(value*100)}%`:'unknown'; },
  label(key) {return ({eat:'eat',drink:'drink',toilet:'find a toilet',rest:'rest',flee:'move away',forage:'look for food',investigate:'investigate',socialize:'seek company',avoid:'give someone space',pickup:'pick up an item',drop:'put an item down',destroy:'remove an item'})[key]||key;},
  action(action,state) {
    if(action?.tag==='Hesitate')return 'Paused, unsure what to do';
    const i=action?.intent||{};
    const object=[...(state?.map||[]),...(state?.nearby||[]),...(state?.others||[])].find(e=>e.id===i.id);
    const target=object?.name||object?.title||object?.desc||object?.description||i.id||'a destination';
    return ({Eat:`Going to eat: ${target}`,Drink:`Going to drink: ${target}`,Toilet:`Seeking relief at: ${target}`,Approach:`Going to investigate: ${target}`,Flee:`Moving away from: ${target}`,Socialize:`Seeking company with ${target}`,Avoid:`Giving ${target} space`,PickUp:`Going to pick up: ${target}`,Drop:'Putting down a carried item',Destroy:`Going to remove: ${target}`,Rest:'Resting',Wander:'Exploring the habitat'})[i.tag]||'Continuing the current activity';
  },
  judgment(row, checked) {
    const state=this.parse(row.state)||{}, decision=this.parse(row.decision)||{}, action=this.parse(row.action)||{};
    const answers=decision.answers||[], behavior=answers.find(a=>a.name==='behavior')?.answer;
    const choices=[...(behavior?.probabilities||[])].sort((a,b)=>b.p-a.p).slice(0,2);
    const distribution=choices.map(p=>`${this.label(p.key)} ${this.percent(p.p)}`).join(' · ');
    const confidence=Number.isFinite(behavior?.confidence)?`Confidence ${this.percent(behavior.confidence)}; action threshold ${this.percent(checked?.threshold)}.`:'';
    const facts=[];
    for(const item of answers){
      if(item.name.startsWith('threat_')&&typeof item.answer?.p==='number'){
        const target=[...(state.map||[]),...(state.nearby||[])].find(e=>e.id===item.name.slice(7));
        facts.push(`Danger judgment for ${target?.desc||item.name.slice(7)}: ${this.percent(item.answer.p)} probability.`);
      }
    }
    const reflection=answers.find(a=>a.name==='self_belief')?.answer;
    if(reflection)facts.push(`Self-reflection: ${reflection.choice==='keep'?'keep my current view':reflection.choice}; confidence ${this.percent(reflection.confidence)}.`);
    return {kind:'judgment',id:row.creatureId,tick:row.tick,title:this.action(action,state),detail:distribution?`Jev’s alternatives: ${distribution}. ${confidence}`:confidence,
      explanation:checked?.explanation||'',facts,row,source:row.source==='synthetic'||String(decision.model).startsWith('synthetic')?'Synthetic judgment':'Jev judgment'};
  },
  outcomes(previous,current) {
    if(!previous)return [];
    const events=[];
    for(const c of current.creatures){
      const before=previous.creatures.find(p=>p.id===c.id);if(!before)continue;
      for(const e of c.identity?.experiences||[]){
        if(e.serial>(before.identity?.total||0)){
          const deltas=[];
          for(const [key,label] of [['hunger','Hunger'],['thirst','Thirst'],['bowel','Need for relief'],['energy','Energy'],['comfort','Comfort']]){
            if(Number.isFinite(before[key])&&Number.isFinite(c[key])&&Math.abs(c[key]-before[key])>=.025)deltas.push(`${label} ${this.percent(before[key])} → ${this.percent(c[key])}`);
          }
          events.push({kind:'outcome',id:c.id,tick:e.tick,title:e.text,detail:deltas.join(' · '),source:'Observed outcome'});
        }
      }
      if(JSON.stringify(before.identity?.beliefs)!==JSON.stringify(c.identity?.beliefs)&&c.identity?.history?.length){
        const change=c.identity.history.at(-1);
        events.push({kind:'identity',id:c.id,tick:change.tick,title:c.selfDescription,detail:`Previously: ${change.before}`,facts:change.evidence.map(e=>`Tick ${e.tick}: ${e.text}`),source:'Self-image changed'});
      }
      if(before.health>0&&c.health<=0)events.push({kind:'outcome',id:c.id,tick:current.tick,title:`Died of ${c.deathCause}`,detail:'Their recorded experiences remain in their story.',source:'Observed outcome'});
    }
    return events;
  }
};
globalThis.NoulFeedback=NoulFeedback;
if(typeof module!=='undefined')module.exports=NoulFeedback;
