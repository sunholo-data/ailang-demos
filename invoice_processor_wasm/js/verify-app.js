/**
 * AILANG Contract Verification — Interactive Showcase
 *
 * Drives the verify.html page:
 *   1. Loads pre-computed Z3 verification results (verify-data.js)
 *   2. Renders animated verification pipeline for each module
 *   3. Displays AILANG source code with syntax highlighting
 *   4. Loads modules in WASM REPL for live function execution
 */

import { MODULES, VERIFY_RESULTS, DISPLAY_ORDER } from './verify-data.js';
import AilangEngine from './ailang-wrapper.js';

// ── State ────────────────────────────────────────────────────
let currentModule = 'verify_showcase';
let selectedFunction = null;
let engine = null;
let wasmReady = false;
let modulesLoaded = new Set();

// ── DOM refs ─────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── Initialize ───────────────────────────────────────────────
async function init() {
  setupModuleChips();
  renderModule(currentModule);
  animateScoreboard();
  await initWasm();
}

// ── Scoreboard animation ─────────────────────────────────────
function animateScoreboard() {
  const totals = { verified: 0, violation: 0, skipped: 0 };
  for (const mod of Object.values(VERIFY_RESULTS)) {
    totals.verified += mod.verified;
    totals.violation += mod.counterexample;
    totals.skipped += mod.skipped;
  }

  animateCounter('scoreVerified', totals.verified, 800);
  animateCounter('scoreViolation', totals.violation, 1200);
  animateCounter('scoreSkipped', totals.skipped, 1400);
}

function animateCounter(id, target, duration) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(eased * target);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ── Module chip selection ────────────────────────────────────
function setupModuleChips() {
  $$('.module-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $$('.module-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const moduleId = chip.dataset.module;
      if (moduleId !== currentModule) {
        currentModule = moduleId;
        selectedFunction = null;
        renderModule(moduleId);
        hideTryIt();
      }
    });
  });
}

// ── Render a module ──────────────────────────────────────────
function renderModule(moduleId) {
  const mod = MODULES[moduleId];
  const results = VERIFY_RESULTS[moduleId];
  if (!mod || !results) return;

  // Update header
  $('#moduleTitle').textContent = `${mod.title} — ${mod.subtitle}`;
  $('#moduleDesc').textContent = mod.description;

  // Update source panel
  $('#sourceFilename').textContent = results.file;
  renderSourceCode(moduleId);

  // Update pipeline
  renderPipeline(moduleId);
}

// ── Source code rendering with syntax highlighting ───────────
async function renderSourceCode(moduleId) {
  const results = VERIFY_RESULTS[moduleId];
  const sourceEl = $('#sourceCode');

  // Fetch the .ail source file
  try {
    const resp = await fetch(`ailang/${results.file}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const source = await resp.text();
    sourceEl.innerHTML = `<pre><code>${highlightAilang(source)}</code></pre>`;
  } catch {
    // Fallback: show module info
    const mod = MODULES[moduleId];
    const lines = [`-- ${mod.title}: ${mod.subtitle}`, `-- ${mod.description}`, ''];
    const order = DISPLAY_ORDER[moduleId] || [];
    for (const fname of order) {
      const fn = mod.functions[fname];
      if (!fn) continue;
      lines.push(`-- ${fn.description}`);
      lines.push(`export func ${fn.signature}`);
      if (fn.requires) lines.push(`  requires { ${fn.requires} }`);
      if (fn.ensures) lines.push(`  ensures { ${fn.ensures} }`);
      lines.push('');
    }
    sourceEl.innerHTML = `<pre><code>${highlightAilang(lines.join('\n'))}</code></pre>`;
  }
}

function scrollSourceToFunction(fname) {
  const anchor = document.getElementById(`src-${fname}`);
  if (!anchor) return;
  const container = $('#sourceCode');
  // Use getBoundingClientRect for both elements, then add the container's
  // current scrollTop to convert from viewport-relative to content-relative.
  // This works for inline <span> inside <pre> where offsetTop is unreliable.
  const containerRect = container.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  const posInContent = anchorRect.top - containerRect.top + container.scrollTop;
  // Temporarily disable smooth scroll so we can set position, then re-enable
  container.style.scrollBehavior = 'auto';
  container.scrollTop = Math.max(0, posInContent - 60);
  // Force reflow then restore smooth for future user scrolling
  container.offsetHeight; // eslint-disable-line no-unused-expressions
  container.style.scrollBehavior = '';
  // Brief highlight flash so the user spots it
  anchor.classList.add('source-highlight');
  setTimeout(() => anchor.classList.remove('source-highlight'), 1500);
}

// Reuses the same highlighting approach as app.js
function highlightAilang(source) {
  const escaped = escapeHtml(source);
  return escaped.split('\n').map(line => {
    // Comment lines: highlight entire line, no further processing
    const stripped = line.trimStart();
    if (stripped.startsWith('--')) {
      return '<span class=cm>' + line + '</span>';
    }
    // For non-comment lines: strings first, then keywords/types/constructors
    return line
      // Strings (must be first — before we add any HTML tags)
      .replace(/"([^"\\]|\\.)*"/g, '<span class=st>$&</span>')
      // Keywords
      .replace(/\b(module|import|export|type|func|pure|let|match|if|then|else|in|requires|ensures|result|true|false)\b/g, '<span class=kw>$1</span>')
      // Types
      .replace(/\b(string|int|float|bool|Json|Option|Result)\b/g, '<span class=ty>$1</span>')
      // Constructors (ALL_CAPS + Some/None/Ok/Err)
      .replace(/\b(Some|None|Ok|Err)\b/g, '<span class=ct>$1</span>')
      .replace(/\b([A-Z][A-Z_0-9]{1,})\b/g, '<span class=ct>$1</span>')
      // Effect annotations
      .replace(/(!\s*\{[^}]+\})/g, '<span class=ct>$1</span>')
      // Function names after func keyword — add id anchor for scroll-to
      // Note: by this point `func` is already wrapped as <span class=kw>func</span>
      .replace(/(<span class=kw>func<\/span>\s+)(<span class=\w+>)?(\w+)/g, (_, pre, tag, name) =>
        `${pre}${tag || ''}<span class=fn id="src-${name}">${name}</span>`)
      // Inline comments (after code on same line)
      .replace(/(--[^<]*)$/g, '<span class=cm>$1</span>');
  }).join('\n');
}

// ── Pipeline rendering ───────────────────────────────────────
function renderPipeline(moduleId) {
  const mod = MODULES[moduleId];
  const results = VERIFY_RESULTS[moduleId];
  const order = DISPLAY_ORDER[moduleId] || [];

  // Build result lookup
  const resultMap = {};
  for (const r of results.results) {
    resultMap[r.function] = r;
  }

  // Stats bar
  const statsEl = $('#pipelineStats');
  statsEl.innerHTML = '';
  if (results.verified > 0) {
    statsEl.innerHTML += `<span class="pipeline-stat verified">${results.verified} verified</span>`;
  }
  if (results.counterexample > 0) {
    statsEl.innerHTML += `<span class="pipeline-stat violation">${results.counterexample} violation</span>`;
  }
  if (results.skipped > 0) {
    statsEl.innerHTML += `<span class="pipeline-stat skipped">${results.skipped} skipped</span>`;
  }

  // Render steps
  const body = $('#pipelineBody');
  body.innerHTML = '';

  order.forEach((fname, index) => {
    const fn = mod.functions[fname];
    const result = resultMap[fname];
    if (!fn || !result) return;

    const status = result.status === 'counterexample' ? 'violation' : result.status;

    // Connector (between steps)
    if (index > 0) {
      const conn = document.createElement('div');
      conn.className = `v-connector ${status}`;
      body.appendChild(conn);
    }

    // Step
    const step = document.createElement('div');
    step.className = 'verify-step';
    step.dataset.function = fname;
    step.dataset.module = moduleId;

    // Animate entrance
    step.style.animationDelay = `${0.05 + index * 0.04}s`;

    step.innerHTML = `
      <div class="v-dot pending" data-target="${status}"></div>
      <div class="v-info">
        <div class="v-name">${fname}</div>
        <div class="v-desc">${fn.description}</div>
      </div>
      <div class="v-badge ${status}">${status}${result.bounded_depth ? ' <span class="v-bounded">depth ' + result.bounded_depth + '</span>' : ''}</div>
      <div class="v-detail">
        <div class="v-detail-inner">
          ${renderDetailContent(fn, result, status)}
        </div>
      </div>
    `;

    // Click handler
    step.addEventListener('click', () => {
      // Toggle expand
      const wasExpanded = step.classList.contains('expanded');
      $$('.verify-step.expanded').forEach(s => s.classList.remove('expanded'));
      if (!wasExpanded) {
        step.classList.add('expanded');
        // Scroll source code to this function
        scrollSourceToFunction(fname);
        // Show Try It if function has tryIt config, or a message if not
        if (fn.tryIt) {
          selectedFunction = fname;
          showTryIt(moduleId, fname);
        } else {
          selectedFunction = null;
          showTryItUnavailable(fn);
        }
      } else {
        // Collapsing — hide Try It
        selectedFunction = null;
        hideTryIt();
      }
    });

    body.appendChild(step);
  });

  // Animate dots (staggered reveal)
  setTimeout(() => animateDots(), 100);
}

function renderDetailContent(fn, result, status) {
  let html = '';

  // Contract display
  if (fn.requires || fn.ensures) {
    html += '<div class="v-contract">';
    if (fn.requires) {
      html += `<div class="v-contract-label">requires</div>`;
      html += `<code>${escapeHtml(fn.requires)}</code><br>`;
    }
    if (fn.ensures) {
      html += `<div class="v-contract-label" ${fn.requires ? 'style="margin-top:6px"' : ''}>ensures</div>`;
      html += `<code>${escapeHtml(fn.ensures)}</code>`;
    }
    html += '</div>';
  }

  // Counterexample
  if (status === 'violation' && result.model) {
    html += '<div class="counterexample">';
    html += '<div class="counterexample-title">';
    html += '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 3v5M8 11h.01"/><circle cx="8" cy="8" r="7"/></svg>';
    html += 'Z3 Counterexample';
    html += '</div>';
    html += '<div class="counterexample-inputs">';
    for (const param of result.model) {
      if (param.name === 'result') continue;
      html += `<span class="cx-param"><span class="cx-name">${param.name} = </span><span class="cx-val">${param.value}</span></span>`;
    }
    html += '</div>';
    if (fn.bug) {
      html += `<div class="counterexample-explain">${escapeHtml(fn.bug)}</div>`;
    }
    html += '</div>';
  }

  // Bounded recursion info
  if (result.bounded_depth && status === 'verified') {
    html += '<div class="bounded-card">';
    html += `<div class="bounded-card-title">Bounded Recursion Unrolling</div>`;
    html += `<div style="font-size:0.72rem;color:var(--text-secondary)">Z3 unrolled recursion to depth ${result.bounded_depth} and proved the contract for all inputs within bounds.</div>`;
    html += '</div>';
  }

  // Skip reason
  if (status === 'skipped') {
    html += '<div class="skip-card">';
    html += '<div class="skip-card-title">Outside Decidable Fragment</div>';
    html += `<div style="font-size:0.72rem;color:var(--text-secondary)">${escapeHtml(fn.skipReason || result.reason || 'Function uses features not encodable in SMT')}</div>`;
    html += '</div>';
  }

  return html;
}

// ── Animate dots from pending to final state ─────────────────
function animateDots() {
  const dots = $$('.v-dot.pending');
  dots.forEach((dot, i) => {
    setTimeout(() => {
      const target = dot.dataset.target;
      dot.classList.remove('pending');
      dot.classList.add('active');
      setTimeout(() => {
        dot.classList.remove('active');
        dot.classList.add(target);
      }, 150);
    }, i * 80);
  });
}

// ── Try It panel ─────────────────────────────────────────────
function showTryIt(moduleId, fname) {
  const mod = MODULES[moduleId];
  const fn = mod.functions[fname];
  if (!fn || !fn.tryIt) return;

  $('#tryitEmpty').style.display = 'none';
  $('#tryitContent').style.display = 'block';
  $('#tryitFuncName').textContent = fn.signature;
  $('#tryitResult').classList.remove('visible');
  $('#tryitStatus').textContent = '';

  // Build param inputs
  const paramsEl = $('#tryitParams');
  paramsEl.innerHTML = '';

  for (const param of fn.tryIt.params) {
    const div = document.createElement('div');
    div.className = 'tryit-param';

    const label = document.createElement('label');
    label.textContent = param.name;
    div.appendChild(label);

    if (param.type === 'enum') {
      const select = document.createElement('select');
      select.dataset.param = param.name;
      for (const opt of param.options) {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        if (opt === param.default) option.selected = true;
        select.appendChild(option);
      }
      div.appendChild(select);
    } else if (param.type === 'string') {
      const input = document.createElement('input');
      input.type = 'text';
      input.dataset.param = param.name;
      input.value = param.default;
      div.appendChild(input);
    } else {
      const input = document.createElement('input');
      input.type = 'number';
      input.dataset.param = param.name;
      input.value = param.default;
      div.appendChild(input);
    }

    paramsEl.appendChild(div);
  }

  // Wire run button
  const runBtn = $('#tryitRunBtn');
  runBtn.style.display = '';
  runBtn.onclick = () => executeTryIt(moduleId, fname);
  runBtn.disabled = !wasmReady;
}

function hideTryIt() {
  $('#tryitEmpty').style.display = 'block';
  $('#tryitContent').style.display = 'none';
  $('#tryitResult').classList.remove('visible');
}

function showTryItUnavailable(fn) {
  $('#tryitEmpty').style.display = 'none';
  $('#tryitContent').style.display = 'block';
  $('#tryitFuncName').textContent = fn.signature;
  $('#tryitParams').innerHTML = '';
  $('#tryitRunBtn').style.display = 'none';
  $('#tryitResult').classList.remove('visible');
  $('#tryitStatus').textContent = fn.noTryIt || 'This function uses parameter types not supported in the browser demo';
}

async function executeTryIt(moduleId, fname) {
  if (!wasmReady || !engine) {
    $('#tryitStatus').textContent = 'WASM not ready';
    return;
  }

  const mod = MODULES[moduleId];
  const fn = mod.functions[fname];
  if (!fn) return;

  // Ensure module is loaded
  if (!modulesLoaded.has(moduleId)) {
    await loadVerifyModule(moduleId);
  }

  // Gather params — typed args for callFunction, expression fragments for eval
  const paramDefs = fn.tryIt.params;
  const typedArgs = [];
  const argStrings = [];
  const hasEnums = paramDefs.some(p => p.type === 'enum');
  const paramEls = $$('#tryitParams [data-param]');
  paramEls.forEach((el, i) => {
    const paramDef = paramDefs[i];
    const raw = el.value;
    if (paramDef.type === 'int') {
      typedArgs.push(parseInt(raw, 10));
      argStrings.push(raw);
    } else if (paramDef.type === 'string') {
      typedArgs.push(raw);
      argStrings.push(`"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    } else {
      // enum — bare constructor name
      typedArgs.push(raw);
      argStrings.push(raw);
    }
  });

  $('#tryitStatus').textContent = 'Executing...';
  $('#tryitRunBtn').disabled = true;

  try {
    let result;

    if (hasEnums) {
      // Enum constructors can't be passed as strings through ailangCall — they must
      // be parsed as AILANG syntax. Generate a tiny wrapper module that imports the
      // constructors and calls the function with the actual enum values.
      const imports = new Set([fname]);
      paramDefs.forEach(p => {
        if (p.type === 'enum' && p.options) {
          p.options.forEach(opt => imports.add(opt));
        }
      });
      const retType = fn.signature.match(/->\s*(\w+)/)?.[1] || 'int';
      const callExpr = `${fname}(${argStrings.join(', ')})`;
      const wrapperName = '__verify_tryit_' + Date.now();
      const wrapperCode = [
        `module ${wrapperName}`,
        `import ${mod.module} (${[...imports].join(', ')})`,
        `export func run(_: int) -> ${retType} ! {} { ${callExpr} }`
      ].join('\n');

      const loadResult = engine.loadDynamicModule(wrapperName, wrapperCode);
      if (loadResult.success) {
        result = engine.callFunction(wrapperName, 'run', 0);
      } else {
        result = { success: false, error: loadResult.error };
      }
    } else {
      // For int/string-only params, callFunction works directly (proven pattern
      // used by docparse and invoice processor demos).
      result = engine.callFunction(mod.module, fname, ...typedArgs);
    }

    const resultEl = $('#tryitResult');
    const valueEl = $('#tryitResultValue');
    const checkEl = $('#tryitContractCheck');

    if (result.success) {
      const display = result.raw != null ? String(result.raw) : JSON.stringify(result.result);
      valueEl.textContent = display;

      // Simple contract check hint
      if (fn.ensures) {
        checkEl.textContent = 'ensures { ' + fn.ensures + ' }';
        checkEl.className = 'tryit-contract-check pass';
      } else {
        checkEl.textContent = 'No contract';
        checkEl.className = 'tryit-contract-check';
      }

      resultEl.classList.add('visible');
      $('#tryitStatus').textContent = '';
    } else {
      valueEl.textContent = result.error || 'Error';
      checkEl.textContent = 'Execution failed';
      checkEl.className = 'tryit-contract-check fail';
      resultEl.classList.add('visible');
      $('#tryitStatus').textContent = '';
    }
  } catch (err) {
    $('#tryitStatus').textContent = `Error: ${err.message}`;
  } finally {
    $('#tryitRunBtn').disabled = false;
  }
}

// ── WASM initialization ──────────────────────────────────────
async function initWasm() {
  const dot = $('#wasmDot');
  const label = $('#wasmLabel');

  dot.className = 'wasm-dot loading';
  label.textContent = 'Loading WASM...';

  try {
    engine = new AilangEngine();
    await engine.init();

    dot.className = 'wasm-dot ready';
    label.textContent = `WASM ready (${engine.repl.getVersion() || 'dev'})`;
    wasmReady = true;

    // Enable run button if try-it is open
    const runBtn = $('#tryitRunBtn');
    if (runBtn) runBtn.disabled = false;

    // Pre-load current module
    await loadVerifyModule(currentModule);
  } catch (err) {
    console.error('WASM init failed:', err);
    dot.className = 'wasm-dot error';
    label.textContent = 'WASM unavailable';
  }
}

async function loadVerifyModule(moduleId) {
  if (modulesLoaded.has(moduleId)) return true;

  const results = VERIFY_RESULTS[moduleId];
  if (!results) return false;

  try {
    const resp = await fetch(`ailang/${results.file}`);
    if (!resp.ok) return false;
    const source = await resp.text();
    const mod = MODULES[moduleId];
    const loadResult = engine.loadDynamicModule(mod.module, source);
    if (loadResult.success) {
      modulesLoaded.add(moduleId);
      return true;
    }
    console.warn(`Failed to load ${mod.module}:`, loadResult.error);
    return false;
  } catch (err) {
    console.warn(`Failed to fetch module ${moduleId}:`, err);
    return false;
  }
}

// ── Utils ────────────────────────────────────────────────────
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Boot ─────────────────────────────────────────────────────
init();
