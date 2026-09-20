/* Public BYO-key transport. AILANG owns request schemas, parsing and policy.
   No Studio endpoints: the only credential-bearing destination is OpenRouter. */
class NoulsTransport {
  constructor(call, fetcher = (...args) => fetch(...args)) {
    this.call = call;
    this.fetcher = fetcher;
    this.sessions = new Map();
  }
  reply(value, status = 200) { return {ok: status < 400, status, json: async () => value}; }
  async request(path, options = {}) {
    if (path === 'api/status') return this.reply({available:true, liveTransport:'browser', sessionBudget:.10});
    if (path === 'api/session') {
      const token = crypto.randomUUID();
      this.sessions.set(token, {spent:0, requests:0, images:0, busy:false, pictures:new Map()});
      return this.reply({ok:true, session:token, budget:.10});
    }
    if (!['api/decision','api/character','api/image'].includes(path)) return this.reply({ok:false,error:'Unknown operation'},404);
    const payload = JSON.parse(options.body);
    const session = this.sessions.get(payload.session);
    if (!session) return this.reply({ok:false,error:'Start a new live session.'},403);
    const report = (value, status=200) => this.reply({...value,sessionCost:session.spent,sessionBudget:.10},status);
    const key = options.headers?.['X-Nouls-Key'];
    if (!key) return report({ok:false,error:'Enter your OpenRouter key.'},400);
    if (session.busy) return report({ok:false,retryable:true,error:'Finishing another request in this tab. Retrying shortly.'},429);
    const image = path === 'api/image';
    if (image && session.pictures.has(payload.id)) {
      const cached = session.pictures.get(payload.id);
      return cached.description === payload.description ? report(cached.result) : report({ok:false,error:'This item already has a different picture request.'},400);
    }
    if (session.spent >= .10 || session.requests >= 10000) return report({ok:false,error:'The $0.10 session spending limit has been reached. Reset to begin a new session.'},402);
    if (image && (session.spent + .014 > .10 || session.images >= 8)) return report({ok:false,error:'Not enough budget for another picture, or eight pictures already requested.'},402);
    session.busy = true;
    let sent = false, accounted = false;
    try {
      let body;
      if (image) {
        if (typeof payload.description !== 'string' || !payload.description.trim() || payload.description.length > 160 || typeof payload.id !== 'string') throw Error('Invalid item description.');
        body = JSON.stringify({model:'black-forest-labs/flux.2-klein-4b',prompt:
          'Create one small game inventory illustration. Single isolated object, chunky readable silhouette, softly shaded matte 3D style, three-quarter overhead view. Use slate grey and restrained orange accents. Centre the entire object with generous empty margins on a perfectly flat pale green background (#f1f5ed), which will be removed. No scenery, ground plane, text, lettering, border or watermark. Depict this item: '+payload.description,
          aspect_ratio:'1:1',output_format:'png',n:1});
      } else {
        const prepared = path === 'api/decision'
          ? await this.call('prepareLive',payload.world,payload.id,payload.completed)
          : await this.call('prepareCharacter',payload.name,payload.description);
        if (!prepared.ok) return report(prepared,400);
        body = prepared.body;
      }
      const signal = options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(image?75000:45000)]) : AbortSignal.timeout(image?75000:45000);
      signal.throwIfAborted();
      session.requests++;if(image)session.images++;
      sent = true;
      const response = await this.fetcher('https://openrouter.ai'+(image?'/api/v1/images':'/api/alpha/decisions'), {
        method:'POST',headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},body,signal,credentials:'omit',redirect:'error'
      });
      if (!response.ok) {
        accounted = [400,401,403,402,429].includes(response.status);
        throw Error(`OpenRouter returned HTTP ${response.status}. ${response.status===401?'Check your key.':response.status===402?'Check your OpenRouter credit.':'Try again when ready.'}`);
      }
      const text = await this.readBounded(response,image?8*1024*1024:1024*1024);
      const raw = JSON.parse(text);
      const cost = raw.usage?.cost;
      if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) session.spent += cost;
      else session.spent = .10;
      accounted = true;
      let result;
      if (image) result = {ok:true,image:this.imageData(raw),cost};
      else result = path === 'api/decision'
        ? await this.call('completeLive',payload.world,payload.id,text)
        : await this.call('completeCharacter',payload.name,payload.description,text);
      if (image && result.ok) session.pictures.set(payload.id,{description:payload.description,result});
      return report(result);
    } catch (error) {
      if (sent && !accounted) session.spent = .10; // Charges may have occurred: do not retry silently.
      return report({ok:false,error:error.message+(sent&&!accounted?' Spending is uncertain; this session is stopped.':'')},502);
    } finally { session.busy = false; }
  }
  async readBounded(response, limit) {
    if (Number(response.headers.get('content-length')) > limit) throw Error('Provider response is too large.');
    const reader = response.body.getReader(), chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('Provider response is too large.');}chunks.push(value);}
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
    return new TextDecoder().decode(bytes);
  }
  imageData(raw) {
    const item=raw.data?.[0],type=item?.media_type||'image/png',base64=item?.b64_json;
    if (!['image/png','image/jpeg','image/webp'].includes(type)||typeof base64!=='string'||base64.length>7*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw Error('Unsupported picture format.');
    const bytes=atob(base64);
    const valid=type==='image/png'?bytes.startsWith('\x89PNG\r\n\x1a\n'):type==='image/jpeg'?bytes.startsWith('\xff\xd8\xff'):bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP';
    if(!valid||bytes.length>5*1024*1024)throw Error('Invalid picture data.');
    return `data:${type};base64,${base64}`;
  }
}
globalThis.NoulsTransport=NoulsTransport;
if(typeof module!=='undefined')module.exports=NoulsTransport;
