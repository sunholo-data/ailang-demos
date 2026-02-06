/**
 * AILANG Document Extractor — Pipeline Orchestrator
 *
 * Wires together: WASM engine, schema editor, schema compiler,
 * Gemini client, output formatter, and demo examples.
 *
 * 3-tier execution:
 *   1. WASM AI handler + API key → full AILANG pipeline (processDocument)
 *   2. No WASM AI handler + API key → JS extraction + AILANG validation (validateOnly)
 *   3. No API key → pre-extracted demo data + AILANG validation (validateOnly)
 */

import AilangEngine from './ailang-wrapper.js';
import { SchemaCompiler } from './schema-compiler.js';
import { SchemaEditor } from './schema-editor.js';
import { GeminiClient, loadApiKey, saveApiKey, clearApiKey } from './gemini-client.js';
import { OutputFormatter } from './output-formatter.js';
import { demoExamples } from './examples.js';

// ── Globals ──────────────────────────────────────────────────
let engine = null;
const compiler = new SchemaCompiler();
let schemaEditor = null;
let formatter = null;
let currentDemo = null;   // key into demoExamples, or null for custom
let running = false;

// ── DOM References ───────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── Initialization ───────────────────────────────────────────
async function init() {
  // Set up UI components first (before async WASM load)
  setupApiKeyPanel();
  setupDemoButtons();
  setupInputMethods();
  setupActionButtons();

  // Schema editor
  const editorEl = $('#schema-editor');
  if (editorEl) {
    schemaEditor = new SchemaEditor(editorEl);
    schemaEditor.onChange = onSchemaChange;
  }

  // Output formatter
  formatter = new OutputFormatter();

  // Initialize WASM engine
  showLoading('Initializing AILANG WASM runtime...');
  try {
    engine = new AilangEngine();
    await engine.init();

    // Register Gemini as AI handler
    const apiKey = loadApiKey();
    if (apiKey) {
      const gemini = new GeminiClient(apiKey);
      engine.setAIHandler(async (input) => {
        // The AILANG std/ai.call(prompt) sends the prompt here
        // We extract fields using the prompt directly
        // The input is the full prompt string from AILANG
        return JSON.stringify(await gemini.extractFields(input, schemaEditor.getSchema()));
      });
    }

    hideLoading();
    updateApiKeyBadge();

    // Load default demo
    loadDemo('invoice');
  } catch (err) {
    hideLoading();
    showError(`Failed to initialize AILANG: ${err.message}`);
    console.error('Init error:', err);
  }
}

// ── API Key Panel ────────────────────────────────────────────
function setupApiKeyPanel() {
  const toggle = $('#apiKeyToggle');
  const panel = toggle?.closest('.api-key-panel');
  if (toggle && panel) {
    toggle.addEventListener('click', () => panel.classList.toggle('open'));
  }

  const saveBtn = $('#saveKeyBtn');
  const clearBtn = $('#clearKeyBtn');
  const input = $('#apiKeyInput');

  if (saveBtn && input) {
    saveBtn.addEventListener('click', () => {
      const key = input.value.trim();
      if (key) {
        saveApiKey(key);
        input.value = '';
        panel?.classList.remove('open');
        updateApiKeyBadge();
        // Re-register AI handler with new key
        if (engine) {
          const gemini = new GeminiClient(key);
          engine.setAIHandler(async (prompt) => {
            return JSON.stringify(await gemini.extractFields(prompt, schemaEditor.getSchema()));
          });
        }
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearApiKey();
      updateApiKeyBadge();
    });
  }

  // Load existing key into input hint
  if (input && loadApiKey()) {
    input.placeholder = 'Key saved (click Clear to remove)';
  }
}

function updateApiKeyBadge() {
  const badge = $('#demoBadge');
  if (!badge) return;
  const hasKey = !!loadApiKey();
  badge.textContent = hasKey ? 'Live Mode' : 'Demo Mode';
  badge.className = hasKey ? 'demo-badge live' : 'demo-badge';
}

// ── Demo Buttons ─────────────────────────────────────────────
function setupDemoButtons() {
  // Support both demo-chip (toolbar) and demo-btn (legacy) selectors
  $$('[data-demo]').forEach(btn => {
    btn.addEventListener('click', () => {
      loadDemo(btn.dataset.demo);
    });
  });
}

function loadDemo(name) {
  const demo = demoExamples[name];
  if (!demo) return;

  currentDemo = name;

  // Update active states on all demo selectors
  $$('[data-demo]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.demo === name);
  });

  // Load document
  const docInput = $('#documentInput');
  if (docInput) docInput.value = demo.document;

  // Load schema
  if (schemaEditor) {
    schemaEditor.loadSchema(demo.schema);
  }

  // Auto-run extraction
  runPipeline();
}

// ── Input Methods ────────────────────────────────────────────
function setupInputMethods() {
  $$('.method-btn[data-method]').forEach(btn => {
    btn.addEventListener('click', () => {
      const method = btn.dataset.method;
      $$('.method-btn').forEach(b => b.classList.toggle('active', b.dataset.method === method));

      const textarea = $('#documentInput');
      const fileInput = $('#fileUpload');

      if (method === 'upload' && fileInput) {
        fileInput.click();
      }
    });
  });

  const fileInput = $('#fileUpload');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const textarea = $('#documentInput');
        if (textarea) textarea.value = reader.result;
        currentDemo = null;
        $$('[data-demo]').forEach(b => b.classList.remove('active'));
        // Reset method toggle back to paste
        $$('.method-btn').forEach(b => b.classList.toggle('active', b.dataset.method === 'paste'));
      };
      reader.readAsText(file);
    });
  }
}

// ── Action Buttons ───────────────────────────────────────────
function setupActionButtons() {
  const extractBtn = $('#extractBtn');
  if (extractBtn) {
    extractBtn.addEventListener('click', () => runPipeline());
  }

  const clearBtn = $('#clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const docInput = $('#documentInput');
      if (docInput) docInput.value = '';
      currentDemo = null;
      $$('[data-demo]').forEach(b => b.classList.remove('active'));
      resetPipelineSteps();
      updateGeneratedCode('-- Define a schema to see generated AILANG code');
      const results = $('#results');
      if (results) results.innerHTML = '<p class="placeholder">Select a demo or provide your own document and schema</p>';
    });
  }
}

// ── Schema Change Handler ────────────────────────────────────
function onSchemaChange(schema) {
  // Regenerate AILANG code preview
  if (schema && schema.fields.length > 0) {
    const ailangSource = compiler.compile(schema);
    updateGeneratedCode(ailangSource);
  }
}

// ── Pipeline Steps UI ────────────────────────────────────────
function resetPipelineSteps() {
  $$('.pipe-step').forEach(step => {
    step.classList.remove('active', 'complete', 'error');
  });
  $$('.pipe-connector').forEach(conn => {
    conn.classList.remove('complete');
  });
}

function setStepActive(stepNum) {
  const step = $(`.pipe-step[data-step="${stepNum}"]`);
  if (step) {
    step.classList.remove('error');
    step.classList.add('active');
  }
}

function setStepComplete(stepNum) {
  const step = $(`.pipe-step[data-step="${stepNum}"]`);
  if (step) {
    step.classList.remove('active', 'error');
    step.classList.add('complete');
  }
  // Mark connector after this step as complete
  const connectors = document.querySelectorAll('.pipe-connector');
  if (connectors[stepNum - 1]) {
    connectors[stepNum - 1].classList.add('complete');
  }
}

function setStepError(stepNum) {
  const step = $(`.pipe-step[data-step="${stepNum}"]`);
  if (step) {
    step.classList.remove('active', 'complete');
    step.classList.add('error');
  }
}

// ── Generated Code Display ───────────────────────────────────
function updateGeneratedCode(source) {
  const codeEl = $('#generatedCode code');
  if (!codeEl) return;
  codeEl.textContent = source;
  // Apply syntax highlighting
  codeEl.innerHTML = highlightAilang(codeEl.textContent);
}

function highlightAilang(code) {
  const escaped = escapeHtml(code);
  return escaped.split('\n').map(line => {
    // Comment lines: highlight entire line, no further processing
    const stripped = line.trimStart();
    if (stripped.startsWith('--')) {
      return '<span class=cm>' + line + '</span>';
    }
    // For non-comment lines: strings first, then keywords/types/constructors
    // Use single-quote HTML attributes to avoid conflicts with AILANG strings
    return line
      // Strings (must be first — before we add any HTML tags)
      .replace(/"([^"\\]|\\.)*"/g, '<span class=st>$&</span>')
      // Keywords
      .replace(/\b(module|import|export|type|func|pure|let|match|if|then|else|requires|ensures)\b/g, '<span class=kw>$1</span>')
      // Types
      .replace(/\b(string|int|float|bool|Json|Option|Result)\b/g, '<span class=ty>$1</span>')
      // Constructors
      .replace(/\b(Some|None|Ok|Err|true|false)\b/g, '<span class=ct>$1</span>')
      // Effect annotations
      .replace(/(!\s*\{[^}]+\})/g, '<span class=ct>$1</span>')
      // Function names after func keyword
      .replace(/(func\s+)(<span class=\w+>)?(\w+)/g, '$1$2<span class=fn>$3</span>')
      // Inline comments (after code on same line)
      .replace(/(--[^<]*)$/g, '<span class=cm>$1</span>');
  }).join('\n');
}

// ── Main Pipeline ────────────────────────────────────────────
async function runPipeline() {
  if (running) return;
  if (!engine || !engine.ready) {
    showError('AILANG engine not initialized');
    return;
  }

  const schema = schemaEditor?.getSchema();
  if (!schema || schema.fields.length === 0) {
    showError('Please define at least one field in the schema');
    return;
  }

  const documentText = $('#documentInput')?.value?.trim();
  if (!documentText) {
    showError('Please provide a document to extract from');
    return;
  }

  running = true;
  const extractBtn = $('#extractBtn');
  if (extractBtn) extractBtn.disabled = true;

  resetPipelineSteps();
  showLoading('Running extraction pipeline...');

  try {
    // Step 1: Compile schema → AILANG module
    setStepActive(1);
    const ailangSource = compiler.compile(schema);
    updateGeneratedCode(ailangSource);
    await sleep(150); // Brief visual pause
    setStepComplete(1);

    // Step 2: Load module into WASM
    setStepActive(2);
    await engine.reset();
    const loadResult = engine.loadDynamicModule('extractor', ailangSource);
    if (!loadResult.success) {
      throw new Error(`AILANG compile error: ${loadResult.error}`);
    }
    await sleep(150);
    setStepComplete(2);

    // Step 3: Extract fields (AI or demo data)
    setStepActive(3);
    let extractedJson;
    const apiKey = loadApiKey();

    if (engine.hasNativeAI() && apiKey) {
      // Tier 1: Full AILANG pipeline — AI effect handled by WASM runtime
      const result = engine.callFunction('extractor', 'processDocument', documentText);
      if (!result.success) {
        throw new Error(result.error);
      }
      setStepComplete(3);

      // Step 4: Validation happened inside AILANG
      setStepActive(4);
      await sleep(100);
      setStepComplete(4);

      // Step 5: Done
      setStepComplete(5);
      displayResult(result.result, schema);

    } else if (apiKey) {
      // Tier 2: JS extraction + AILANG validation
      const gemini = new GeminiClient(apiKey);
      extractedJson = await gemini.extractFields(documentText, schema);
      setStepComplete(3);

      // Step 4: Validate in AILANG
      setStepActive(4);
      const jsonString = JSON.stringify(extractedJson);
      const result = engine.callFunction('extractor', 'validateOnly', jsonString);
      if (!result.success) {
        throw new Error(result.error);
      }
      await sleep(100);
      setStepComplete(4);

      // Step 5: Done
      setStepComplete(5);
      displayResult(result.result, schema);

    } else {
      // Tier 3: Demo data + AILANG validation
      const demo = currentDemo ? demoExamples[currentDemo] : null;
      if (demo?.preExtracted) {
        extractedJson = demo.preExtracted;
      } else {
        // No API key, no demo — show message
        setStepError(3);
        showError('No API key configured. Add a Gemini API key for live extraction, or select a demo example.');
        return;
      }
      setStepComplete(3);

      // Step 4: Validate in AILANG
      setStepActive(4);
      const jsonString = JSON.stringify(extractedJson);
      const result = engine.callFunction('extractor', 'validateOnly', jsonString);
      if (!result.success) {
        throw new Error(result.error);
      }
      await sleep(100);
      setStepComplete(4);

      // Step 5: Done
      setStepComplete(5);
      displayResult(result.result, schema);
    }

  } catch (err) {
    console.error('Pipeline error:', err);
    // Mark current active step as error
    $$('.pipe-step.active').forEach(s => {
      s.classList.remove('active');
      s.classList.add('error');
    });
    showError(err.message);
  } finally {
    running = false;
    if (extractBtn) extractBtn.disabled = false;
  }
}

// ── Result Display ───────────────────────────────────────────
function displayResult(rawResult, schema) {
  const resultsEl = $('#results');
  if (!resultsEl) return;

  // Parse the JSON result from AILANG
  let parsed;
  try {
    parsed = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
  } catch (e) {
    showError(`Failed to parse AILANG output: ${e.message}`);
    return;
  }

  // Use the output formatter
  formatter.render(parsed, schema, resultsEl);
}

// ── UI Helpers ───────────────────────────────────────────────
function showLoading(message) {
  const resultsEl = $('#results');
  if (!resultsEl) return;
  resultsEl.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function hideLoading() {
  // Replaced by actual results
}

function showError(message) {
  const resultsEl = $('#results');
  if (!resultsEl) return;
  resultsEl.innerHTML = `
    <div class="result-error">
      <h3><span class="icon-fail"></span> Error</h3>
      <p class="error-message">${escapeHtml(message)}</p>
    </div>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text ?? '');
  return div.innerHTML;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Bootstrap ────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
