/* Presentation only. Targets and headings always come from the AILANG world. */
class NoulMotion {
  constructor(root) {
    this.root=root;
    this.states=new Map();
    this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
    this.frame=0;
    this.lastTick=null;
  }
  angleDelta(a,b) {return Math.atan2(Math.sin(b-a),Math.cos(b-a));}
  update(world,now=performance.now()) {
    const reset=this.lastTick===null || world.tick<this.lastTick;
    this.lastTick=world.tick;
    for(const c of world.creatures) {
      const el=this.root.querySelector(`[data-id="${c.id}"]`);
      if(!el)continue;
      let s=this.states.get(c.id);
      if(reset||!s||s.el!==el) {
        s={el,x:c.pos.x,y:c.pos.y,h:c.heading,phase:0,updated:now};
        this.states.set(c.id,s);
      }
      const distance=Math.hypot(c.pos.x-s.x,c.pos.y-s.y);
      s.duration=Math.min(240,Math.max(90,now-s.updated));
      s.updated=now;s.start=now;s.fromX=s.x;s.fromY=s.y;s.fromH=s.h;
      s.toX=c.pos.x;s.toY=c.pos.y;s.toH=s.h+this.angleDelta(s.h,c.heading);
      s.dead=c.status==='dead';s.distance=distance;s.phaseStart=s.phase;
      s.phaseEnd=s.phase+distance/1.8; // One gait cycle per distance actually travelled.
      s.held=this.root.querySelector(`#carried-art [data-carrier="${c.id}"]`);
      s.a=el.querySelector('.sprite-a');s.b=el.querySelector('.sprite-b');
      // patchSvg supplies canonical AILANG positions; restore current visual pose.
      this.paint(s,now);
    }
    if(!this.frame)this.frame=requestAnimationFrame(t=>this.animate(t));
  }
  paint(s,now) {
    const t=this.reduced.matches?1:Math.min(1,(now-s.start)/s.duration);
    const turn=this.reduced.matches?1:Math.min(1,(now-s.start)/180);
    s.x=s.fromX+(s.toX-s.fromX)*t;s.y=s.fromY+(s.toY-s.fromY)*t;
    s.h=s.fromH+(s.toH-s.fromH)*(turn*turn*(3-2*turn));
    s.phase=s.phaseStart+(s.phaseEnd-s.phaseStart)*t;
    if(s.held)s.held.setAttribute('transform',`translate(${(s.x+2.3).toFixed(3)} ${(s.y-.5).toFixed(3)})`);
    s.el.setAttribute('transform',`translate(${s.x.toFixed(3)} ${s.y.toFixed(3)})`);
    const angle=((s.h/(Math.PI*2)%1)+1)%1*16;
    const column=Math.floor(angle),blend=angle-column;
    const walking=!s.dead&&!this.reduced.matches&&s.distance>.005&&t<1;
    const row=walking?1+Math.floor(((s.phase%1)+1)%1*4):0;
    s.a.setAttribute('viewBox',`${column*128} ${row*128} 128 128`);
    s.b.setAttribute('viewBox',`${((column+1)%16)*128} ${row*128} 128 128`);
    s.b.style.opacity=this.reduced.matches?'0':String(blend);
    s.el.dataset.walking=String(walking);
    return t<1||turn<1;
  }
  animate(now) {
    this.frame=0;
    let active=false;
    for(const s of this.states.values())active=this.paint(s,now)||active;
    if(active)this.frame=requestAnimationFrame(t=>this.animate(t));
  }
}
window.NoulMotion=NoulMotion;
