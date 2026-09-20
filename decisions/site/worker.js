/* One serialized AILANG runtime. No policy or model requests in JavaScript. */
importScripts('../wasm/wasm_exec.js');
let ready;
async function initialize() {
  const go = new Go();
  const response = await fetch('../wasm/ailang.wasm');
  if (!response.ok) throw new Error('WASM could not be loaded');
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
  go.run(instance);
  self.ailangSetTypeCheckBudget(8000);
  const modules = [['pkg/sunholo/decisions/decide', 'ailang/pkg/sunholo/decisions/decide.ail'], ...['world','souls','render','oracle','bank','host'].map(n => [n, `${n}.ail`])];
  for (const [name, path] of modules) {
    postMessage({progress: `Loading ${name.split('/').pop()}…`});
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Missing module: ${path}`);
    const loaded = self.ailangLoadModule(name, await res.text());
    if (!loaded.success) throw new Error(`${name}: ${loaded.error}`);
  }
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
