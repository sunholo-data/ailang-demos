/* One serialized AILANG runtime. No policy or model requests in JavaScript. */
importScripts('../wasm/wasm_exec.js');
let ready;
async function initialize() {
  postMessage({progress:'Bringing the habitat home…',completed:0});
  const go = new Go();
  const url = new URL('../wasm/ailang.wasm', self.location.href).href;
  // Large WASM responses can be evicted/skipped by the ordinary HTTP cache.
  // Cache Storage keeps one shared URL; validators still pick up runtime rebuilds.
  let cache, saved;
  try { cache = await caches.open('ailang-runtime-v1'); saved = await cache.match(url); } catch (_) {}
  const headers = {};
  if (saved?.headers.get('ETag')) headers['If-None-Match'] = saved.headers.get('ETag');
  else if (saved?.headers.get('Last-Modified')) headers['If-Modified-Since'] = saved.headers.get('Last-Modified');
  const network = await fetch(url, {headers, cache:'no-store', signal: AbortSignal.timeout(90000)});
  const fromCache = network.status === 304 && Boolean(saved);
  const response = fromCache ? saved : network;
  if (!response.ok) throw new Error('WASM could not be loaded');
  // A quota/private-browsing restriction must not prevent the world from loading.
  const stored = !fromCache && cache ? cache.put(url, response.clone()).catch(() => {}) : Promise.resolve();
  const total = Number(response.headers.get('Content-Length')) || 0;
  const reader = response.body?.getReader();
  let bytes;
  if (reader) {
    const chunks = [];let received = 0, lastReport = 0;
    while (true) {
      const {done, value} = await reader.read();if (done) break;
      chunks.push(value);received += value.byteLength;
      if (Date.now() - lastReport > 150 || received === total) {
        const downloaded = (received / 1048576).toFixed(1);
        const size = total ? ` of ${(total / 1048576).toFixed(1)}` : '';
        postMessage({progress: `${fromCache ? "Opening the saved habitat" : "Bringing the habitat home"}… ${downloaded}${size} MB`, completed: total ? Math.min(1, received / total) : 0});
        lastReport = Date.now();
      }
    }
    bytes = new Uint8Array(received);let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk, offset);offset += chunk.byteLength;}
  } else bytes = await response.arrayBuffer();
  await stored;
  postMessage({progress:'Waking the world…',completed:1});
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
  go.run(instance);
  self.ailangSetTypeCheckBudget(8000);
  const modules = [['pkg/sunholo/decisions/decide', 'ailang/pkg/sunholo/decisions/decide.ail'], ...['world','souls','render','oracle','bank','host'].map(n => [n, `${n}.ail`])];
  const stages=['Teaching the Nouls to choose…','Growing their habitat…','Finding their personalities…','Painting the little world…','Preparing their intuition…','Making room for memories…','Welcoming the Nouls…'];
  for (const [index, [name, path]] of modules.entries()) {
    postMessage({progress:stages[index],completed:2+index});
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Missing module: ${path}`);
    const loaded = self.ailangLoadModule(name, await res.text());
    if (!loaded.success) throw new Error(`${name}: ${loaded.error}`);
  }
  postMessage({progress:'Letting everyone settle in…',completed:9});
}
let queue = Promise.resolve();
onmessage = ({data}) => {
  queue = queue.then(async () => {
    try {
      if (!ready) ready = initialize();
      await ready;
      if (data.fn === 'configure') {
        if (data.mode === 'simulate') self.ailangGrantCapability('Rand');
        if (data.mode === 'live') {
          for (const cap of ['Rand','Env','Net']) self.ailangGrantCapability(cap);
          const key = data.key;
          self.ailangSetEffectHandler('Env', {getEnv: name => name === 'OPENROUTER_API_KEY' && key ? {_ctor:'Ok', _fields:[key]} : {_ctor:'Err', _fields:[{_ctor:'NotFound', _fields:[name]}]}});
        }
        postMessage({id: data.id, result: 'configured'}); return;
      }
      const result = await self.ailangCallAsync('host', data.fn, ...(data.args || []));
      if (!result.success) throw new Error(result.error);
      postMessage({id: data.id, result: result.result});
    } catch (error) { postMessage({id: data.id, error: error.message}); }
  });
};
