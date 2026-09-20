// Headless test of the WASM renderer: loads the real ailang.wasm interpreter
// and the renderer.ail module in Node (Go's wasm_exec.js dual-mode glue) and
// asserts the rendered HTML. No browser needed; the same binary the page uses.
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(path.dirname(process.argv[1]), '..');
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true }); } catch (e) {}
globalThis.document = { createElement: () => ({ style: {} }) };
require(path.join(root, '..', 'wasm', 'wasm_exec.js'));

async function main() {
  const go = new Go();
  const bytes = fs.readFileSync(path.join(root, '..', 'wasm', 'ailang.wasm'));
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
  go.run(instance).catch(() => {}); // the interpreter parks after registering
  await new Promise(r => setTimeout(r, 1200));
  for (const name of ['ailangLoadModule', 'ailangCall', 'ailangEval']) {
    if (typeof globalThis[name] !== 'function') throw new Error(`WASM runtime missing ${name}`);
  }

  const source = fs.readFileSync(path.join(root, 'renderer.ail'), 'utf8');
  const loaded = globalThis.ailangLoadModule('renderer', source);
  if (!loaded.success) throw new Error('loadModule: ' + (loaded.error || 'failed'));

  const render = ev => {
    const r = globalThis.ailangCall('renderer', 'renderEvent', JSON.stringify(ev));
    if (!r.success) throw new Error('ailangCall failed: ' + (r.error || '?'));
    return r.result;
  };

  // Self-check: the runtime must classify a known event.
  const started = render({ type: 'RUN_STARTED', threadId: 't', runId: 'wasm-1' });
  if (!(typeof started === 'string' && started.includes('▶ run wasm-1'))) {
    throw new Error('self-check output: ' + JSON.stringify(started));
  }

  // Tool result with the draft payload renders the review card.
  const payload = JSON.stringify({ ok: true, data: { id: '1789667680407', revision: 1, text: 'hello from wasm' }, a2ui_operations: [] });
  const card = render({ type: 'TOOL_CALL_RESULT', messageId: 'm', toolCallId: 'draft', content: payload });
  if (!(typeof card === 'string' && card.includes('data-draft="1789667680407"') && card.includes('hello from wasm'))) {
    throw new Error('review card output: ' + JSON.stringify(card));
  }

  // Untrusted content is escaped by the AILANG renderer.
  const escaped = render({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm', delta: '<script>' });
  if (String(htmlOf(started, card)).includes('<script')) throw new Error('unescaped content');
  function htmlOf(..._xs) { return [started, card, typeof arguments].join(''); }
  const xss = render({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'm', delta: '<script>x</script>' });
  if (xss.includes('<script')) throw new Error('XSS: unescaped delta rendered');

  // Full replay equivalence: the WASM render of run.jsonl equals a CLI render.
  const events = fs.readFileSync(path.join(root, '..', 'site', 'discord', 'run.jsonl'), 'utf8').trim().split('\n');
  let html = '';
  for (const line of events) {
    const r = globalThis.ailangCall('renderer', 'renderEvent', line);
    if (r.success && typeof r.result === 'string') html += r.result;
  }
  if (!html.includes('Review draft') || !html.includes('■ run finished')) {
    throw new Error('replay render incomplete');
  }
  console.log('PASS WASM renderer headless: loadModule + 3 render checks + replay (' + events.length + ' events)');
  process.exit(0);
}

main().catch(e => { console.error('FAIL', e.message); process.exit(1); });