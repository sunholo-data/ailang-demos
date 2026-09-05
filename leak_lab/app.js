import { scenarios } from './scenarios.js';
const $ = id => document.getElementById(id);
let selected = scenarios[0], worker, loaded = false, busy = false, pending, deadline;
let originals = {}, serial = 0;
const visited = new Set();
const checkButton = $('check');
const list = $('scenarios');
for (const scenario of scenarios) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'scenario'; button.textContent = scenario.name;
  button.dataset.scenario = scenario.id; button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => select(scenario)); list.append(button);
}
function clearVerdict() {
  $('verdictTitle').textContent = 'The boundary is waiting.';
  $('verdictSummary').textContent = 'Check this source to see whether AILANG permits the flow.';
  $('verdictMark').textContent = '?'; $('boundaryIcon').textContent = '?';
  document.querySelector('.verdict').dataset.status = 'idle'; $('flow').dataset.state = 'idle';
  $('explanation').hidden = true; $('diagnosticPanel').hidden = true;
  $('compilerReceipt').hidden = true; $('responsePanel').hidden = true;
}
function select(scenario) {
  if (busy) return;
  selected = scenario; $('source').value = originals[scenario.id] || '';
  $('experimentTitle').textContent = scenario.name; $('experimentAction').textContent = scenario.action;
  $('route').textContent = scenario.route; $('edited').textContent = 'Original example';
  for (const button of list.children) button.setAttribute('aria-pressed', String(button.dataset.scenario === scenario.id));
  clearVerdict();
}
function controls() {
  checkButton.disabled = !loaded || busy;
  checkButton.textContent = busy ? 'AILANG is checking…' : loaded ? 'Check with AILANG' : 'Loading compiler…';
  $('source').readOnly = busy; $('reset').disabled = busy;
  for (const b of list.children) b.disabled = busy;
}
function fail(message) {
  clearTimeout(deadline); busy = false; loaded = false; pending = null; worker?.terminate(); controls();
  $('runtime').textContent = message;
  $('compilerTitle').textContent = 'AILANG compiler unavailable';
  $('compilerState').textContent = message;
  $('compilerReceipt').hidden = true; $('responsePanel').hidden = true;
  $('verdictTitle').textContent = 'The check could not finish.';
  $('verdictSummary').textContent = 'This is a compiler or runtime failure, not a blocked leak. Use Retry compiler to start a fresh worker.';
  document.querySelector('.verdict').dataset.status = 'error';
  $('verdictMark').textContent = '!'; $('boundaryIcon').textContent = '!';
  window.__demoError = message; window.__demoReady = false;
  checkButton.disabled = false; checkButton.textContent = 'Retry compiler';
}
function startCompiler() {
  worker?.terminate(); loaded = false; busy = false; pending = null; controls();
  delete window.__demoError; window.__demoReady = false;
  $('runtime').textContent = 'Loading isolated AILANG v0.35.0 compiler…';
  $('compilerTitle').textContent = 'Loading the AILANG compiler…';
  $('compilerState').textContent = 'Downloading WebAssembly, then checking a known forbidden flow.';
  worker = new Worker('./worker.js');
  deadline = setTimeout(() => fail('Compiler loading timed out. Check your connection, then retry.'), 60000);
  worker.onerror = event => { event.preventDefault(); fail(event.message || 'Compiler worker failed.'); };
  worker.onmessage = ({ data }) => {
    if (data.type === 'error') return fail(data.error);
    if (data.type === 'ready') {
      clearTimeout(deadline); loaded = true; controls();
      $('runtime').textContent = 'AILANG v0.35.0 · Browser-only compiler · No experiment execution';
      // Fail closed if the compiler does not reject a known forbidden flow.
      pending = { id: ++serial, selfTest: true };
      busy = true; controls();
      deadline = setTimeout(() => fail('Compiler self-check timed out.'), 10000);
      worker.postMessage({ type: 'check', id: serial, source: originals.direct });
      return;
    }
    if (data.type !== 'result' || !pending || pending.id !== data.id) return;
    clearTimeout(deadline);
    const request = pending; pending = null; busy = false; controls();
    if (request.selfTest) {
      if (data.result.status !== 'blocked') return fail('Compiler self-check failed: a known secret leak was not rejected.');
      window.__demoReady = true;
      $('compilerTitle').textContent = 'AILANG is running in your browser.';
      $('compilerState').textContent = `Compiler ${data.result.version} loaded. Secret-flow self-check passed.`;
      $('runtime').textContent = 'AILANG v0.35.0 · Secret-flow self-check passed · Runs locally';
      return;
    }
    showResult(data.result, request, data.durationMs);
  };
}
function check() {
  if (!loaded) return originals.direct ? startCompiler() : loadExamples();
  if (busy) return;
  const source = $('source').value;
  if (new TextEncoder().encode(source).length > 16000) {
    showResult({ status: 'invalid', diagnostics: ['Keep the experiment under 16,000 bytes.'] }, { original: false }); return;
  }
  busy = true; controls();
  pending = { id: ++serial, original: source === originals[selected.id], scenario: selected };
  $('compilerReceipt').hidden = true; $('responsePanel').hidden = true;
  $('verdictTitle').textContent = 'AILANG is checking your source…';
  $('verdictSummary').textContent = 'Parsing, type-checking, then tracing information flow.';
  deadline = setTimeout(() => fail('The experiment exceeded the 10-second limit. The worker was stopped.'), 10000);
  worker.postMessage({ type: 'check', id: serial, source });
}
function showResult(result, request, durationMs) {
  const measured = Number.isFinite(durationMs);
  $('compilerReceipt').hidden = !measured;
  $('compilerReceipt').textContent = measured ? `Checked by AILANG ${result.version} in ${durationMs.toFixed(1)} ms on this device.` : '';
  $('responsePanel').hidden = !measured;
  $('compilerResponse').textContent = measured ? JSON.stringify(result, null, 2) : '';
  const status = result.status;
  document.querySelector('.verdict').dataset.status = status; $('flow').dataset.state = status;
  const blocked = status === 'blocked', allowed = status === 'allowed';
  $('verdictMark').textContent = blocked ? '×' : allowed ? '↗' : '!';
  $('boundaryIcon').textContent = blocked ? '×' : allowed ? '↗' : '!';
  $('verdictTitle').textContent = blocked ? 'This flow is blocked.' : allowed ? 'This flow is permitted.' : status === 'invalid' ? 'Fix the experiment first.' : 'The compiler failed.';
  $('verdictSummary').textContent = blocked ? 'AILANG rejected an information-flow violation before execution.' : allowed ? (result.declassify ? 'Explicit declassification authority is present. Permission does not prove that the output is redacted.' : 'No information-flow violation was found in this module. That is not a general security certificate.') : 'A syntax, type or compiler error is not evidence that the secrecy policy worked.';
  const diagnostics = result.diagnostics || [];
  $('diagnostics').textContent = diagnostics.join('\n\n'); $('diagnosticPanel').hidden = !diagnostics.length;
  $('explanation').hidden = false;
  $('explanation').textContent = request.original ? request.scenario.why : 'You edited the experiment. This verdict applies to the code shown, including any changes to labels, sinks or declassification authority. Review those boundaries before interpreting a pass.';
  if (request.original && status === request.scenario.expected) {
    visited.add(request.scenario.id);
    list.querySelector(`[data-scenario="${request.scenario.id}"]`).dataset.checked = 'true';
    $('progress').textContent = `${visited.size} of ${scenarios.length} examples checked`;
    $('progressBar').style.width = `${100 * visited.size / scenarios.length}%`;
  }
  window.__leakLastResult = result;
}
checkButton.addEventListener('click', check);
$('reset').addEventListener('click', () => select(selected));
$('source').addEventListener('input', () => { $('edited').textContent = $('source').value === originals[selected.id] ? 'Original example' : 'Your experiment'; clearVerdict(); });
$('source').addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); check(); } });
$('download').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([$('source').value], { type: 'text/plain' }));
  const link = document.createElement('a'); link.href = url; link.download = 'experiment.ail'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
async function loadExamples() {
try {
  checkButton.disabled = true;
  const entries = await Promise.all(scenarios.map(async s => {
    const response = await fetch(`examples/${s.id}.ail`);
    if (!response.ok) throw new Error(`Could not load ${s.name} (${response.status})`);
    return [s.id, await response.text()];
  }));
  originals = Object.fromEntries(entries); select(selected); startCompiler();
} catch (error) { fail(error.message); }

}
await loadExamples();
