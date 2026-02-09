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
import { loadDocParseModules, DOCPARSE_MODULE } from './docparse-loader.js';
import { blockToMarkdown } from './docparse-output.js';

// ── Globals ──────────────────────────────────────────────────
let engine = null;
const compiler = new SchemaCompiler();
let schemaEditor = null;
let formatter = null;
let currentDemo = null;   // key into demoExamples, or null for custom
let running = false;
let uploadedBinary = null; // { base64, mimeType, fileName, fileSize, lastModified, uploadedAt }
let docparseLoaded = false;
let docparseLoading = false;
let lastUploadWasOffice = false; // Track if DocParse step should stay visible

// ── File Size Limits ────────────────────────────────────────
const FILE_SIZE_LIMITS = {
  image: 10 * 1024 * 1024,   // 10 MB for images
  pdf: 20 * 1024 * 1024,     // 20 MB for PDFs
  text: 5 * 1024 * 1024,     // 5 MB for text files
  office: 50 * 1024 * 1024,  // 50 MB for Office documents
};

const OFFICE_EXTENSIONS = ['.docx', '.pptx', '.xlsx'];
function isOfficeFile(fileName) {
  return OFFICE_EXTENSIONS.some(ext => fileName.toLowerCase().endsWith(ext));
}

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
      registerAIHandler(apiKey);
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
          registerAIHandler(key);
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

// ── AI Handler ──────────────────────────────────────────────
function registerAIHandler(apiKey) {
  const gemini = new GeminiClient(apiKey);
  engine.setAIHandler(async (input) => {
    // AILANG sends either a plain text prompt or a JSON-structured multimodal request
    try {
      const req = JSON.parse(input);
      if (req.mode === 'multimodal' && req.data) {
        // Multimodal: AILANG built a JSON request with base64 file data + metadata
        return JSON.stringify(await gemini.extractFields(
          req.prompt || '', schemaEditor.getSchema(),
          { base64: req.data, mimeType: req.mimeType, fileName: req.fileName || '', fileSize: uploadedBinary?.fileSize || 0 }
        ));
      }
    } catch { /* not JSON — fall through to text mode */ }
    // Text mode: input is the full prompt string from AILANG
    return JSON.stringify(await gemini.extractFields(input, schemaEditor.getSchema()));
  });
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
  uploadedBinary = null;
  hideFilePreview();
  $('#uploadChip')?.classList.remove('has-file');

  // Update active states on all demo selectors
  $$('[data-demo]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.demo === name);
  });

  // Load schema (if provided — Office demos let the user define or auto-detect)
  if (schemaEditor && demo.schema) {
    schemaEditor.loadSchema(demo.schema);
  }

  // If demo has a PDF URL, fetch it as binary
  if (demo.pdfUrl) {
    const docInput = $('#documentInput');
    if (docInput) docInput.style.display = 'none';
    loadPdfDemo(demo);
    return;
  }

  // If demo has an Office URL, fetch and process with DocParse
  if (demo.officeUrl) {
    loadOfficeDemo(demo);
    return;
  }

  // Restore textarea and load document
  const docInput = $('#documentInput');
  if (docInput) {
    docInput.style.display = '';
    docInput.value = demo.document;
    docInput.placeholder = 'Paste document text here...';
  }

  // Auto-run extraction
  runPipeline();
}

async function loadPdfDemo(demo) {
  showLoading('Loading PDF demo...');
  try {
    const response = await fetch(demo.pdfUrl);
    if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }

    uploadedBinary = {
      base64: btoa(binary),
      mimeType: 'application/pdf',
      fileName: demo.pdfUrl.split('/').pop(),
      fileSize: arrayBuffer.byteLength,
      lastModified: null,
      uploadedAt: Date.now()
    };

    showFilePreview(uploadedBinary);
    runPipeline();
  } catch (err) {
    showError(`Failed to load PDF demo: ${err.message}`);
  }
}

async function loadOfficeDemo(demo) {
  showLoading(`Loading ${demo.officeUrl.split('/').pop()}...`);
  try {
    const response = await fetch(demo.officeUrl);
    if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    const fileName = demo.officeUrl.split('/').pop();

    showLoading(`Parsing ${fileName} with DocParse (AILANG)...`);
    const text = await processOfficeFile(fileName, buffer);

    const textarea = $('#documentInput');
    if (textarea) {
      textarea.value = text;
      textarea.style.display = '';
    }
    uploadedBinary = null;
    hideFilePreview();
    showOfficePreview(fileName, buffer.byteLength, text);

    // If the demo has a schema, auto-run the full pipeline (DocParse → AI/demo → validate)
    if (demo.schema && demo.preExtracted) {
      runPipeline();
    } else {
      const resultsEl = $('#results');
      if (resultsEl) {
        resultsEl.innerHTML = `<p class="placeholder">Office document parsed by AILANG DocParse &mdash; ${text.split('\n').length} lines extracted.<br>Define a schema (or use <strong>Detect Schema</strong>) then click <strong>Extract &amp; Validate</strong>.</p>`;
      }
    }
  } catch (err) {
    showError(`Failed to load Office demo: ${err.message}`);
    console.error('Office demo error:', err);
  }
}

// ── Input Methods ────────────────────────────────────────────
function setupInputMethods() {
  // Upload chip in toolbar triggers file picker
  const uploadChip = $('#uploadChip');
  if (uploadChip) {
    uploadChip.addEventListener('click', () => {
      const fileInput = $('#fileUpload');
      if (fileInput) fileInput.click();
    });
  }

  const fileInput = $('#fileUpload');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const textarea = $('#documentInput');
      const textExts = ['.txt', '.json', '.csv'];
      const isText = textExts.some(ext => file.name.toLowerCase().endsWith(ext));

      const isOffice = isOfficeFile(file.name);

      // Check file size limits
      const sizeLimit = isText ? FILE_SIZE_LIMITS.text
        : isOffice ? FILE_SIZE_LIMITS.office
        : file.type === 'application/pdf' ? FILE_SIZE_LIMITS.pdf
        : FILE_SIZE_LIMITS.image;
      if (file.size > sizeLimit) {
        showError(`File too large (${formatFileSize(file.size)}). Maximum is ${formatFileSize(sizeLimit)}.`);
        fileInput.value = '';
        return;
      }

      if (isText) {
        // Text file: read as text, put in textarea
        lastUploadWasOffice = false;
        const reader = new FileReader();
        reader.onload = () => {
          if (textarea) {
            textarea.value = reader.result;
            textarea.style.display = '';
          }
          uploadedBinary = null;
          hideFilePreview();
          currentDemo = null;
          $$('[data-demo]').forEach(b => b.classList.remove('active'));
          $('#uploadChip')?.classList.remove('has-file');
        };
        reader.readAsText(file);
      } else if (isOffice) {
        // Office file: pre-process with DocParse, put extracted text in textarea
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            showLoading(`Parsing ${file.name} with AILANG DocParse...`);
            const text = await processOfficeFile(file.name, reader.result);
            if (textarea) {
              textarea.value = text;
              textarea.style.display = '';
            }
            uploadedBinary = null;
            showOfficePreview(file.name, file.size, text);
            currentDemo = null;
            $$('[data-demo]').forEach(b => b.classList.remove('active'));
            $('#uploadChip')?.classList.add('has-file');
            const resultsEl = $('#results');
            if (resultsEl) resultsEl.innerHTML = `<p class="placeholder">Office document parsed by AILANG DocParse &mdash; ${text.split('\n').length} lines extracted. Click Extract &amp; Validate to process.</p>`;
          } catch (err) {
            showError(`Office document parsing failed: ${err.message}`);
            console.error('DocParse error:', err);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        // Binary file (PDF, image): read as ArrayBuffer, convert to base64
        lastUploadWasOffice = false;
        const reader = new FileReader();
        reader.onload = () => {
          const bytes = new Uint8Array(reader.result);
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
          }

          const mimeType = file.type || guessMimeType(file.name);
          uploadedBinary = {
            base64: btoa(binary),
            mimeType,
            fileName: file.name,
            fileSize: file.size,
            lastModified: file.lastModified,
            uploadedAt: Date.now()
          };

          // Hide textarea, show file preview
          if (textarea) textarea.style.display = 'none';
          showFilePreview(uploadedBinary);

          currentDemo = null;
          $$('[data-demo]').forEach(b => b.classList.remove('active'));
          $('#uploadChip')?.classList.add('has-file');
        };
        reader.readAsArrayBuffer(file);
      }
      fileInput.value = '';
    });
  }
}

// ── Action Buttons ───────────────────────────────────────────
function setupActionButtons() {
  const extractBtn = $('#extractBtn');
  if (extractBtn) {
    extractBtn.addEventListener('click', () => runPipeline());
  }

  const detectBtn = $('#detectSchemaBtn');
  if (detectBtn) {
    detectBtn.addEventListener('click', () => detectSchema());
  }

  const clearBtn = $('#clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const docInput = $('#documentInput');
      if (docInput) {
        docInput.style.display = '';
        docInput.value = '';
        docInput.placeholder = 'Paste document text here...';
      }
      uploadedBinary = null;
      hideFilePreview();
      $('#uploadChip')?.classList.remove('has-file');
      currentDemo = null;
      $$('[data-demo]').forEach(b => b.classList.remove('active'));
      resetPipelineSteps();
      updateGeneratedCode('-- Define a schema to see generated AILANG code');
      const results = $('#results');
      if (results) results.innerHTML = '<p class="placeholder">Select a demo or provide your own document and schema</p>';
    });
  }
}

// ── Auto-Detect Schema ──────────────────────────────────────
async function detectSchema() {
  const apiKey = loadApiKey();
  if (!apiKey) {
    showError('Schema detection requires a Gemini API key. Add one above.');
    return;
  }

  const documentText = $('#documentInput')?.value?.trim();
  if (!documentText && !uploadedBinary) {
    showError('Please provide a document first — paste text or upload a file.');
    return;
  }

  const btn = $('#detectSchemaBtn');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('detecting');
    btn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1l1.5 3.5L13 6l-3.5 1.5L8 11l-1.5-3.5L3 6l3.5-1.5z"/><path d="M12 10l.75 1.75L14.5 12.5l-1.75.75L12 15l-.75-1.75-1.75-.75 1.75-.75z"/></svg> Detecting...`;
  }

  try {
    const gemini = new GeminiClient(apiKey);
    const schema = await gemini.detectSchema(
      documentText || '',
      uploadedBinary || null
    );

    if (schema && schema.fields?.length > 0 && schemaEditor) {
      schemaEditor.loadSchema(schema);
    } else {
      showError('AI could not detect a schema from this document. Try adding more text.');
    }
  } catch (err) {
    showError(`Schema detection failed: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('detecting');
      btn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1l1.5 3.5L13 6l-3.5 1.5L8 11l-1.5-3.5L3 6l3.5-1.5z"/><path d="M12 10l.75 1.75L14.5 12.5l-1.75.75L12 15l-.75-1.75-1.75-.75 1.75-.75z"/></svg> Detect Schema`;
    }
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
    // Preserve DocParse step 0 if the last upload was an Office file
    if (step.dataset.step === '0' && lastUploadWasOffice) return;
    step.classList.remove('active', 'complete', 'error');
    const log = step.querySelector('.pipe-log');
    if (log) log.textContent = '';
  });
  $$('.pipe-connector').forEach((conn, i) => {
    // Preserve first connector if DocParse step is complete
    if (i === 0 && lastUploadWasOffice) return;
    conn.classList.remove('complete');
  });
}

function setStepLog(stepNum, message) {
  const step = $(`.pipe-step[data-step="${stepNum}"]`);
  if (!step) return;
  const log = step.querySelector('.pipe-log');
  if (log) log.textContent = message;
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
  if (!documentText && !uploadedBinary) {
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
    setStepLog(1, `Generating ${schema.name} module...`);
    const ailangSource = compiler.compile(schema);
    updateGeneratedCode(ailangSource);
    await sleep(150);
    setStepLog(1, `${schema.fields.length} fields, ${ailangSource.split('\n').length} lines`);
    setStepComplete(1);

    // Step 2: Load module into WASM
    setStepActive(2);
    setStepLog(2, 'Resetting WASM runtime...');
    await engine.reset();
    docparseLoaded = false; // reset() wipes all dynamic modules
    setStepLog(2, 'Loading extractor module...');
    const loadResult = engine.loadDynamicModule('extractor', ailangSource);
    if (!loadResult.success) {
      throw new Error(`AILANG compile error: ${loadResult.error}`);
    }
    const exportCount = loadResult.exports?.length || 0;
    setStepLog(2, `Module loaded, ${exportCount} exports`);
    await sleep(150);
    setStepComplete(2);

    // Step 3: Extract fields (AI or demo data)
    setStepActive(3);
    let extractedJson;
    const apiKey = loadApiKey();

    if (engine.hasNativeAI() && apiKey) {
      // Tier 1: Full AILANG pipeline — AI effect handled by WASM runtime
      let result;
      if (uploadedBinary) {
        setStepLog(3, `Sending ${formatFileSize(uploadedBinary.fileSize)} ${uploadedBinary.mimeType} to Gemini...`);
        result = await engine.callFunctionAsync('extractor', 'processFile',
          uploadedBinary.base64, uploadedBinary.mimeType, uploadedBinary.fileName);
      } else {
        setStepLog(3, 'Calling Gemini via AILANG ! {AI} effect...');
        result = await engine.callFunctionAsync('extractor', 'processDocument', documentText);
      }
      if (!result.success) {
        throw new Error(result.error);
      }
      setStepLog(3, 'AI extraction complete');
      setStepComplete(3);

      // Step 4: Validation happened inside AILANG — inspect the result
      setStepActive(4);
      const tier1Parsed = safeParse(result.result);
      if (tier1Parsed?.valid) {
        const fieldCount = Object.keys(tier1Parsed).filter(k => k !== 'valid').length;
        setStepLog(4, `${fieldCount} fields validated`);
      } else {
        setStepLog(4, tier1Parsed?.error || 'Validation failed');
      }
      await sleep(100);
      setStepComplete(4);

      // Step 5: Done
      setStepLog(5, 'Tier 1: full AILANG pipeline');
      setStepComplete(5);
      displayResult(result.result, schema);

    } else if (apiKey) {
      // Tier 2: JS extraction + AILANG validation
      const gemini = new GeminiClient(apiKey);
      if (uploadedBinary) {
        setStepLog(3, `Sending ${formatFileSize(uploadedBinary.fileSize)} to Gemini (JS)...`);
      } else {
        setStepLog(3, 'Calling Gemini API (JS fallback)...');
      }
      extractedJson = await gemini.extractFields(
        documentText || '', schema, uploadedBinary || null);
      setStepLog(3, `Extracted ${Object.keys(extractedJson).length} fields`);
      setStepComplete(3);

      // Step 4: Validate in AILANG
      setStepActive(4);
      setStepLog(4, 'Running AILANG contracts...');
      const jsonString = JSON.stringify(extractedJson);
      const result = engine.callFunction('extractor', 'validateOnly', jsonString);
      if (!result.success) {
        throw new Error(result.error);
      }
      const tier2Parsed = safeParse(result.result);
      if (tier2Parsed?.valid) {
        const fieldCount = Object.keys(tier2Parsed).filter(k => k !== 'valid').length;
        setStepLog(4, `${fieldCount} fields validated`);
      } else {
        setStepLog(4, tier2Parsed?.error || 'Validation returned errors');
      }
      await sleep(100);
      setStepComplete(4);

      // Step 5: Done
      setStepLog(5, 'Tier 2: JS extract + AILANG validate');
      setStepComplete(5);
      displayResult(result.result, schema);

    } else {
      // Tier 3: Demo data + AILANG validation
      if (uploadedBinary) {
        setStepError(3);
        setStepLog(3, 'API key required for files');
        showError('File extraction requires a Gemini API key. Add one above to extract from uploaded files.');
        return;
      }
      const demo = currentDemo ? demoExamples[currentDemo] : null;
      if (demo?.preExtracted) {
        setStepLog(3, 'Using pre-extracted demo data');
        extractedJson = demo.preExtracted;
      } else {
        setStepError(3);
        setStepLog(3, 'No API key or demo data');
        showError('No API key configured. Add a Gemini API key for live extraction, or select a demo example.');
        return;
      }
      setStepComplete(3);

      // Step 4: Validate in AILANG
      setStepActive(4);
      setStepLog(4, 'Running AILANG contracts...');
      const jsonString = JSON.stringify(extractedJson);
      const result = engine.callFunction('extractor', 'validateOnly', jsonString);
      if (!result.success) {
        throw new Error(result.error);
      }
      const tier3Parsed = safeParse(result.result);
      if (tier3Parsed?.valid) {
        const fieldCount = Object.keys(tier3Parsed).filter(k => k !== 'valid').length;
        setStepLog(4, `${fieldCount} fields validated`);
      } else {
        setStepLog(4, tier3Parsed?.error || 'Validation returned errors');
      }
      await sleep(100);
      setStepComplete(4);

      // Step 5: Done
      setStepLog(5, 'Tier 3: demo data + AILANG validate');
      setStepComplete(5);
      displayResult(result.result, schema);
    }

  } catch (err) {
    console.error('Pipeline error:', err);
    // Mark current active step as error and log the message
    $$('.pipe-step.active').forEach(s => {
      const stepNum = s.dataset.step;
      s.classList.remove('active');
      s.classList.add('error');
      setStepLog(stepNum, err.message.substring(0, 80));
    });
    showError(err.message);
  } finally {
    running = false;
    if (extractBtn) extractBtn.disabled = false;
  }
}

function safeParse(val) {
  try { return typeof val === 'string' ? JSON.parse(val) : val; }
  catch { return null; }
}

// ── File Metadata Merging ────────────────────────────────────
function mergeMetadata(rawResult) {
  const parsed = safeParse(rawResult);
  if (parsed && uploadedBinary) {
    parsed._file_name = uploadedBinary.fileName;
    parsed._file_type = uploadedBinary.mimeType;
    parsed._file_size = uploadedBinary.fileSize;
    if (uploadedBinary.lastModified) parsed._file_modified = uploadedBinary.lastModified;
    if (uploadedBinary.uploadedAt) parsed._file_uploaded = uploadedBinary.uploadedAt;
  }
  return parsed;
}

// ── Result Display ───────────────────────────────────────────
function displayResult(rawResult, schema) {
  const resultsEl = $('#results');
  if (!resultsEl) return;

  // Parse the JSON result from AILANG and merge file metadata if available
  let parsed;
  try {
    parsed = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
  } catch (e) {
    showError(`Failed to parse AILANG output: ${e.message}`);
    return;
  }

  // Merge file metadata into the result for display
  if (parsed && uploadedBinary) {
    parsed._file_name = uploadedBinary.fileName;
    parsed._file_type = uploadedBinary.mimeType;
    parsed._file_size = uploadedBinary.fileSize;
    if (uploadedBinary.lastModified) parsed._file_modified = uploadedBinary.lastModified;
    if (uploadedBinary.uploadedAt) parsed._file_uploaded = uploadedBinary.uploadedAt;
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

// ── File Upload Helpers ──────────────────────────────────────
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function guessMimeType(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  const map = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg',
    jpeg: 'image/jpeg', webp: 'image/webp', bmp: 'image/bmp'
  };
  return map[ext] || 'application/octet-stream';
}

function showFilePreview(binaryInfo) {
  const previewEl = $('#filePreview');
  if (!previewEl) return;

  // Clean up previous blob URL
  if (previewEl._blobUrl) {
    URL.revokeObjectURL(previewEl._blobUrl);
    previewEl._blobUrl = null;
  }

  const isImage = binaryInfo.mimeType.startsWith('image/');
  const isPdf = binaryInfo.mimeType === 'application/pdf';
  const icon = isImage ? '\u{1F5BC}' : '\u{1F4C4}';

  let bodyHtml;
  if (isImage) {
    bodyHtml = `<img src="data:${binaryInfo.mimeType};base64,${binaryInfo.base64}" alt="${escapeHtml(binaryInfo.fileName)}">`;
  } else if (isPdf) {
    // Use blob URL — data URIs are blocked in some browsers for object/iframe
    const byteChars = atob(binaryInfo.base64);
    const byteArr = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArr], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);
    previewEl._blobUrl = blobUrl;
    bodyHtml = `<object data="${blobUrl}" type="application/pdf" width="100%" height="360">` +
      `<div class="file-preview-fallback">` +
        `<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
          `<rect x="8" y="4" width="32" height="40" rx="3"/>` +
          `<path d="M16 4v10h10"/><path d="M26 4L38 16"/>` +
          `<path d="M16 24h16M16 30h16M16 36h10"/>` +
        `</svg>` +
        `<span>PDF preview not available in this browser — file ready for extraction</span>` +
      `</div>` +
    `</object>`;
  } else {
    bodyHtml = `<div class="file-preview-fallback">` +
      `<span>${icon} File ready for extraction</span>` +
    `</div>`;
  }

  previewEl.innerHTML =
    `<div class="file-preview-header">` +
      `<span class="file-preview-icon">${icon}</span>` +
      `<span class="file-preview-name">${escapeHtml(binaryInfo.fileName)}</span>` +
      `<span class="file-preview-size">${formatFileSize(binaryInfo.fileSize)}</span>` +
      `<button class="file-preview-remove" title="Remove file">&times;</button>` +
    `</div>` +
    `<div class="file-preview-body">${bodyHtml}</div>`;

  previewEl.querySelector('.file-preview-remove').addEventListener('click', () => {
    uploadedBinary = null;
    hideFilePreview();
    const textarea = $('#documentInput');
    if (textarea) {
      textarea.style.display = '';
      textarea.placeholder = 'Paste document text here...';
    }
    $('#uploadChip')?.classList.remove('has-file');
  });

  previewEl.style.display = '';
}

function hideFilePreview() {
  const previewEl = $('#filePreview');
  if (!previewEl) return;
  // Revoke blob URL before clearing
  if (previewEl._blobUrl) {
    URL.revokeObjectURL(previewEl._blobUrl);
    previewEl._blobUrl = null;
  }
  previewEl.style.display = 'none';
  previewEl.innerHTML = '';
}

function showOfficePreview(fileName, fileSize, extractedText) {
  const previewEl = $('#filePreview');
  if (!previewEl) return;

  const ext = fileName.split('.').pop().toUpperCase();
  const lineCount = extractedText.split('\n').length;
  const previewLines = extractedText.split('\n').slice(0, 8).join('\n');

  previewEl.innerHTML =
    `<div class="file-preview-header">` +
      `<span class="file-preview-icon">\u{1F4C4}</span>` +
      `<span class="file-preview-name">${escapeHtml(fileName)}</span>` +
      `<span class="file-preview-size">${formatFileSize(fileSize)}</span>` +
      `<span class="effect-badge pure" style="font-size:0.58rem;padding:1px 6px">AILANG DocParse</span>` +
      `<button class="file-preview-remove" title="Remove file">&times;</button>` +
    `</div>` +
    `<div class="file-preview-body" style="flex-direction:column;align-items:stretch;text-align:left;padding:12px">` +
      `<div style="font-family:var(--font-mono);font-size:0.68rem;color:var(--text-muted);margin-bottom:8px">` +
        `${ext} &rarr; ${lineCount} lines extracted via std/xml` +
      `</div>` +
      `<pre style="font-family:var(--font-mono);font-size:0.72rem;line-height:1.5;color:var(--text-secondary);` +
        `white-space:pre-wrap;word-break:break-word;max-height:180px;overflow-y:auto;margin:0">${escapeHtml(previewLines)}</pre>` +
    `</div>`;

  previewEl.querySelector('.file-preview-remove').addEventListener('click', () => {
    uploadedBinary = null;
    lastUploadWasOffice = false;
    hideFilePreview();
    resetPipelineSteps();
    const textarea = $('#documentInput');
    if (textarea) {
      textarea.value = '';
      textarea.style.display = '';
      textarea.placeholder = 'Paste document text here...';
    }
    $('#uploadChip')?.classList.remove('has-file');
  });

  previewEl.style.display = '';
}

// ── Office Document Pre-Processing (DocParse) ───────────────

async function ensureDocParseLoaded() {
  if (docparseLoaded) return;
  if (docparseLoading) {
    while (docparseLoading) await new Promise(r => setTimeout(r, 100));
    return;
  }
  docparseLoading = true;
  try {
    await loadDocParseModules(engine, (i, total, name) => {
      showLoading(`Loading DocParse module ${i + 1}/${total}...`);
    });
    docparseLoaded = true;
  } finally {
    docparseLoading = false;
  }
}

async function processOfficeFile(fileName, buffer) {
  // Activate pipeline step 0: DocParse
  lastUploadWasOffice = true;
  setStepActive(0);
  setStepLog(0, `Loading DocParse modules...`);

  await ensureDocParseLoaded();
  setStepLog(0, `Parsing ${fileName}...`);

  const formatResult = engine.callFunction(DOCPARSE_MODULE, 'getFormatInfo', fileName);
  if (!formatResult.success) throw new Error('Format detection failed: ' + formatResult.error);
  const formatInfo = JSON.parse(formatResult.result);
  if (formatInfo.format !== 'zip-office') throw new Error(`Unexpected format: ${formatInfo.format}`);

  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.keys(zip.files);
  const allBlocks = [];

  // Parse metadata
  let metadata = null;
  const coreXml = await readZipEntryText(zip, 'docProps/core.xml');
  if (coreXml) {
    const metaResult = engine.callFunction(DOCPARSE_MODULE, 'parseMetadataXml', coreXml);
    if (metaResult.success) metadata = JSON.parse(metaResult.result);
  }

  // Format-specific parsing
  if (formatInfo.officeType === 'word') {
    await parseDocxBlocks(zip, entries, allBlocks);
  } else if (formatInfo.officeType === 'powerpoint') {
    await parsePptxBlocks(zip, entries, allBlocks);
  } else if (formatInfo.officeType === 'excel') {
    await parseXlsxBlocks(zip, entries, allBlocks);
  }

  // Convert blocks to markdown text
  let text = '';
  if (metadata?.title) text += `# ${metadata.title}\n\n`;
  if (metadata?.author) text += `Author: ${metadata.author}\n\n`;
  text += allBlocks.map(blockToMarkdown).join('');

  // Complete pipeline step 0
  setStepLog(0, `${allBlocks.length} blocks extracted via AILANG std/xml`);
  setStepComplete(0);

  return text.trim();
}

async function readZipEntryText(zip, path) {
  const file = zip.file(path);
  if (!file) return null;
  try { return await file.async('string'); } catch { return null; }
}

async function parseDocxBlocks(zip, entries, allBlocks) {
  const bodyXml = await readZipEntryText(zip, 'word/document.xml');
  if (bodyXml) {
    const result = engine.callFunction(DOCPARSE_MODULE, 'parseDocxBody', bodyXml);
    if (result.success) allBlocks.push(...JSON.parse(result.result));
  }
  for (const entry of entries.filter(e => e.startsWith('word/header') && e.endsWith('.xml'))) {
    const xml = await readZipEntryText(zip, entry);
    if (xml) {
      const result = engine.callFunction(DOCPARSE_MODULE, 'parseDocxSection', xml, 'header');
      if (result.success) allBlocks.push(...JSON.parse(result.result));
    }
  }
  for (const entry of entries.filter(e => e.startsWith('word/footer') && e.endsWith('.xml'))) {
    const xml = await readZipEntryText(zip, entry);
    if (xml) {
      const result = engine.callFunction(DOCPARSE_MODULE, 'parseDocxSection', xml, 'footer');
      if (result.success) allBlocks.push(...JSON.parse(result.result));
    }
  }
}

async function parsePptxBlocks(zip, entries, allBlocks) {
  const slideEntries = entries
    .filter(e => e.startsWith('ppt/slides/slide') && e.endsWith('.xml') && !e.includes('_rels'))
    .sort();
  for (const slideEntry of slideEntries) {
    const xml = await readZipEntryText(zip, slideEntry);
    if (xml) {
      const result = engine.callFunction(DOCPARSE_MODULE, 'parsePptxSlide', xml);
      if (result.success) allBlocks.push(...JSON.parse(result.result));
    }
  }
}

async function parseXlsxBlocks(zip, entries, allBlocks) {
  const sharedStringsXml = await readZipEntryText(zip, 'xl/sharedStrings.xml') || '';
  const sheetEntries = entries
    .filter(e => e.startsWith('xl/worksheets/sheet') && e.endsWith('.xml'))
    .sort();
  for (const sheetEntry of sheetEntries) {
    const xml = await readZipEntryText(zip, sheetEntry);
    if (xml) {
      const result = engine.callFunction(DOCPARSE_MODULE, 'parseXlsxSheet', xml, sharedStringsXml, sheetEntry);
      if (result.success) allBlocks.push(...JSON.parse(result.result));
    }
  }
}

// ── Bootstrap ────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
