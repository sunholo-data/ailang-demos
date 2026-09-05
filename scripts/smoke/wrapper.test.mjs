import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// The browser source is an ES module; load it without requiring a root package.json.
const source = await readFile(new URL('../../invoice_processor_wasm/js/ailang-wrapper.js', import.meta.url), 'utf8');
const { default: AilangEngine } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

for (const value of [250, 0, true, false, null, { total: 42 }, [1, 2]]) {
  test(`callFunction preserves typed WASM result ${JSON.stringify(value)}`, () => {
    const engine = new AilangEngine();
    engine.ready = true;
    engine.repl = { call: () => ({ success: true, result: value }) };
    assert.deepEqual(engine.callFunction('demo', 'run'), { success: true, result: value, raw: value });
  });
}

test('legacy quoted JSON and annotated scalar results still parse', () => {
  const engine = new AilangEngine();
  assert.equal(engine._parseResult('"{\\"valid\\":true}" :: string'), '{"valid":true}');
  assert.equal(engine._parseResult('250 :: int'), '250');
  assert.equal(engine._parseResult(''), '');
});
