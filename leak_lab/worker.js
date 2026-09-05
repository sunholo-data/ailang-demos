// Run the real compiler in a disposable worker; no experiment is executed.
importScripts('./wasm/wasm_exec.js');
let boot;
async function init() {
  const go = new Go();
  const response = await fetch('./wasm/checker.wasm');
  if (!response.ok) throw new Error(`Compiler download failed (${response.status})`);
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
  go.run(instance).catch(error => postMessage({ type: 'error', error: error.message }));
  if (!self.ailangLeakReady) throw new Error('Compiler did not initialise');
  postMessage({ type: 'ready', version: 'v0.35.0' });
}
boot = init();
boot.catch(error => postMessage({ type: 'error', error: error.message }));
onmessage = async ({ data }) => {
  try {
    await boot;
    if (data.type !== 'check') return;
    const result = JSON.parse(self.ailangLeakCheck(data.source));
    postMessage({ type: 'result', id: data.id, result });
  } catch (error) { postMessage({ type: 'error', error: error.message }); }
};
