// Headless smoke test — load each WASM demo page and confirm it boots.
//
// Catches the bug class that `ailang check` cannot: pages that compile
// fine but fail at runtime because a required module wasn't pre-loaded,
// a JS handler wasn't wired, or a capability wasn't granted. Three real
// bugs in May 2026 (safe_agent boot, extractor reset(), voice_docparse
// deps) would have been caught here before deploy.
//
// Each WASM demo emits `window.__demoReady = true` on successful init
// (or `window.__demoError = "..."` on failure). The runner waits up to
// READY_TIMEOUT_MS for one of those and reports pass/fail.
//
// Usage:
//   node scripts/smoke/smoke.mjs              # uses BASE=http://localhost:8080
//   BASE=http://localhost:3000 node ...       # custom base URL
//   ONLY=docparse node ...                  # filter demo names
//   FAIL_FAST=1 node ...                      # stop on first failure
//
// Exits non-zero if any demo fails to boot or logs a page error.

import { chromium } from 'playwright';

const BASE = (process.env.BASE || 'http://localhost:8080').replace(/\/+$/, '');
const READY_TIMEOUT_MS = 30000;
const FAIL_FAST = process.env.FAIL_FAST === '1';

// Each entry: { name, url, kind: 'wasm' | 'static' }
// 'wasm' pages must signal __demoReady. 'static' pages just need to load
// without console errors (no boot phase).
const DEMOS = [
  { name: 'hub',                kind: 'static', url: '/' },
  { name: 'document-intelligence', kind: 'static', url: '/document-intelligence/' },
  { name: 'streaming', kind: 'static', url: '/streaming/' },
  { name: 'docparse', kind: 'wasm', url: '/docparse.html', readySelector: '#statusDot.ready' },
  { name: 'verify', kind: 'wasm', url: '/verify.html', readySelector: '#wasmDot.ready' },
  { name: 'contracts-ai', kind: 'static', url: '/contracts-ai.html' },
  { name: 'cognitive_commons', kind: 'wasm', url: '/cognitive_commons/', readySelector: '#ailang-status[data-kind="ready"]' },
  { name: 'co-presenter', kind: 'wasm', url: '/co-presenter/', readySelector: '#statusLabel', readyText: 'Ready' },
  { name: 'website_builder', kind: 'static', url: '/website_builder/' },
  { name: 'ecommerce', kind: 'static', url: '/ecommerce/' },
  { name: 'linkedin', kind: 'static', url: '/linkedin/' },
  ...['agent-ready', 'privacy', 'portable'].map(topic => ({ name: `linkedin/${topic}`, kind: 'static', url: `/linkedin/topics/${topic}/` })),
  { name: 'extractor',          kind: 'wasm',   url: '/extractor.html' },
  { name: 'streaming/claude_chat',       kind: 'wasm',   url: '/streaming/claude_chat/' },
  { name: 'streaming/gemini_live',       kind: 'wasm',   url: '/streaming/gemini_live/' },
  { name: 'streaming/safe_agent',        kind: 'wasm',   url: '/streaming/safe_agent/' },
  { name: 'streaming/voice_docparse',    kind: 'wasm',   url: '/streaming/voice_docparse/' },
  { name: 'streaming/ambient_assistant', kind: 'wasm',   url: '/streaming/ambient_assistant/' },
];

// Console/page-error messages we tolerate. Each demo legitimately logs some
// noise that isn't a smoke-test signal:
//   - Gemini API errors when no API key is configured (expected in headless)
//   - Cross-origin font preconnect warnings
const IGNORE_PATTERNS = [
  /favicon/i,
  /preconnect/i,
  /api key/i,
  /no API key configured/i,
  /font/i,
  // Common harmless 404s — pages legitimately probe for optional assets.
  /service-worker/i,
  /sw\.js$/i,
  /manifest\.json/i,
  /\.map$/i,
  // Generic browser noise that doesn't carry a URL we can match against.
  // The corresponding response 404 (with URL) is already captured by the
  // response handler — and ignored or flagged based on the URL.
  /^console\.error: Failed to load resource:/i,
  /^console\.error: A bad HTTP response code/i,
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const results = [];

for (const demo of DEMOS.filter(d => !process.env.ONLY || d.name.includes(process.env.ONLY))) {
  const page = await ctx.newPage();
  const issues = [];

  page.on('pageerror', (err) => {
    const msg = `pageerror: ${err.message}`;
    if (!IGNORE_PATTERNS.some((re) => re.test(msg))) issues.push(msg);
  });
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const msg = `console.error: ${m.text()}`;
    if (!IGNORE_PATTERNS.some((re) => re.test(msg))) issues.push(msg);
  });
  // Capture failed network requests with the actual URL, so 404s
  // aren't reported as anonymous "Failed to load resource".
  page.on('response', (resp) => {
    if (resp.status() < 400) return;
    const url = resp.url();
    const msg = `${resp.status()} ${url}`;
    if (!IGNORE_PATTERNS.some((re) => re.test(url))) issues.push(msg);
  });

  const url = `${BASE}${demo.url}`;
  let outcome;
  try {
    const resp = await page.goto(url, { timeout: 15000, waitUntil: 'domcontentloaded' });
    if (!resp || !resp.ok()) {
      outcome = `FAIL (HTTP ${resp ? resp.status() : '?'})`;
    } else if (demo.kind === 'wasm') {
      // Wait for either ready or error signal
      const state = await page.evaluate(async ({ timeoutMs, readySelector, readyText }) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          const indicator = readySelector && document.querySelector(readySelector);
          if (indicator && (!readyText || indicator.textContent.trim() === readyText)) return { ready: true };
          if (window.__demoReady === true) return { ready: true };
          if (window.__demoError) return { ready: false, error: window.__demoError };
          await new Promise((r) => setTimeout(r, 100));
        }
        return { ready: false, error: 'timeout waiting for __demoReady' };
      }, { timeoutMs: READY_TIMEOUT_MS, readySelector: demo.readySelector, readyText: demo.readyText });

      if (state.ready && demo.name === 'extractor') {
        for (const preset of ['invoice', 'contract', 'resume']) {
          await page.locator(`[data-demo="${preset}"]`).click();
          await page.locator('#extractBtn').click();
          await page.locator('#results .result-success, #results .result-error').waitFor({ timeout: READY_TIMEOUT_MS });
          if (await page.locator('#results .result-error').count()) throw new Error(await page.locator('#results').innerText());
          console.log(`    validated ${preset} demo data in AILANG`);
        }
        await page.locator('#clearBtn').click();
        if (await page.locator('#documentInput').inputValue()) throw new Error('Clear All left document text');
      }
      if (state.ready && demo.name === 'verify') {
        for (const [module, func, expected] of [
          ['verify_showcase', 'clampPrice', '250'],
          ['billing', 'taxRate', '2100'],
          ['access_policy', 'roleWeight', '100'],
          ['scheduling', 'roomCapacity', '20'],
        ]) {
          await page.locator(`.module-chip[data-module="${module}"]`).click();
          await page.locator(`.verify-step[data-function="${func}"]`).click();
          await page.locator('#tryitRunBtn').click();
          await page.locator('#tryitResult.visible').waitFor({ timeout: READY_TIMEOUT_MS });
          const value = (await page.locator('#tryitResultValue').textContent()).split(' :: ')[0].trim();
          if (value !== expected) throw new Error(`${module}.${func}: expected ${expected}, got ${value}`);
          console.log(`    executed ${module}.${func} = ${value}`);
        }
      }

      if (state.ready && demo.name === 'docparse') {
        const presets = page.locator('.demo-file:not([data-file$=".pdf"])');
        for (let i = 0; i < await presets.count(); i++) {
          const preset = presets.nth(i);
          const name = await preset.textContent();
          await preset.click();
          await page.waitForFunction(() => {
            const status = document.querySelector('#status')?.textContent || '';
            return status === 'Done' || status.startsWith('Error:');
          }, null, { timeout: READY_TIMEOUT_MS });
          const status = await page.locator('#status').textContent();
          if (status !== 'Done') throw new Error(`${name}: ${status}`);
          const stats = await page.locator('.doc-stats').textContent();
          if (!/[1-9]\d* blocks/.test(stats)) throw new Error(`${name}: no parsed blocks (${stats})`);
          console.log(`    parsed ${name}: ${stats}`);
        }
      }

      if (state.ready) {
        outcome = issues.length ? `FAIL (boot ok but ${issues.length} error(s))` : 'PASS';
      } else {
        outcome = `FAIL (${state.error})`;
      }
    } else {
      // Static page — just check no console errors after a short settle.
      await page.waitForTimeout(1500);
      outcome = issues.length ? `FAIL (${issues.length} error(s))` : 'PASS';
    }
  } catch (err) {
    outcome = `FAIL (${err.message.split('\n')[0]})`;
  }

  results.push({ name: demo.name, outcome, issues });
  console.log(`${outcome.padEnd(28)} ${demo.name}`);
  if (issues.length && !outcome.startsWith('PASS')) {
    for (const i of issues.slice(0, 5)) console.log(`    ${i}`);
    if (issues.length > 5) console.log(`    ...and ${issues.length - 5} more`);
  }
  await page.close();
  if (FAIL_FAST && !outcome.startsWith('PASS')) break;
}

await browser.close();

const failed = results.filter((r) => !r.outcome.startsWith('PASS'));
console.log(`\n${results.length - failed.length}/${results.length} demos passed`);
process.exit(failed.length === 0 ? 0 : 1);
